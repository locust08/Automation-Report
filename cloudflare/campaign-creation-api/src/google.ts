import {boundedJson,planSchema, type Plan, type Scope} from './contracts';

export interface GoogleCredentials {
  GOOGLE_ADS_CLIENT_ID: string;
  GOOGLE_ADS_CLIENT_SECRET: string;
  GOOGLE_ADS_REFRESH_TOKEN: string;
  GOOGLE_ADS_DEVELOPER_TOKEN?: string;
  GOOGLE_ADS_CONNECTION_REVISION?: string;
}
type Json = Record<string, any>;
export class ProviderError extends Error {
  constructor(readonly outcome: 'rejected' | 'unknown' | 'unavailable', readonly code: string) {
    super(code);
  }
}
export const providerName = (plan: Plan, workflowId: string) => `${plan.name} [${workflowId}]`;
export function buildOperations(scope: Scope, plan: Plan, workflowId: string): Json[] {
  const prefix = `customers/${scope.platformAccountId}`, budget = `${prefix}/campaignBudgets/-1`;
  const campaign = `${prefix}/campaigns/-2`, adGroup = `${prefix}/adGroups/-3`;
  const name = providerName(plan, workflowId);
  const campaignValue: Json = {
    resourceName: campaign, name, status: 'PAUSED', campaignBudget: budget,
    advertisingChannelType: plan.campaign_type === 'search' ? 'SEARCH' : 'DEMAND_GEN',
    containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
    ...(plan.campaign_type === 'search' ? {
      targetSpend: {}, networkSettings: {targetGoogleSearch: true, targetSearchNetwork: false,
        targetContentNetwork: false, targetPartnerSearchNetwork: false},
      geoTargetTypeSetting: {positiveGeoTargetType: 'PRESENCE', negativeGeoTargetType: 'PRESENCE'},
    } : {maximizeConversions: {}}),
  };
  const operations: Json[] = [
    {campaignBudgetOperation: {create: {resourceName: budget, name: `${name} budget`,
      amountMicros: String(Math.round(Number(plan.daily_budget) * 1_000_000)),
      period: 'DAILY', deliveryMethod: 'STANDARD', explicitlyShared: false}}},
    {campaignOperation: {create: campaignValue}},
    {adGroupOperation: {create: {resourceName: adGroup, campaign,
      name: plan.ad_group_name, status: 'PAUSED',
      ...(plan.campaign_type === 'search' ? {type: 'SEARCH_STANDARD'} : {})}}},
  ];
  const criteria = [...plan.locations.map(geoTargetConstant => ({location: {geoTargetConstant}})),
    ...plan.languages.map(languageConstant => ({language: {languageConstant}}))];
  for (const criterion of criteria) operations.push(plan.campaign_type === 'search'
    ? {campaignCriterionOperation: {create: {campaign, ...criterion}}}
    : {adGroupCriterionOperation: {create: {adGroup, status: 'PAUSED', ...criterion}}});
  if (plan.campaign_type === 'search') {
    for (const text of plan.keywords) operations.push({adGroupCriterionOperation: {
      create: {adGroup, status: 'PAUSED', keyword: {text, matchType: 'EXACT'}},
    }});
    operations.push({adGroupAdOperation: {create: {adGroup, status: 'PAUSED', ad: {
      finalUrls: [plan.final_url], responsiveSearchAd: {
        headlines: plan.headlines.map(text => ({text})), descriptions: plan.descriptions.map(text => ({text})),
      },
    }}}});
  } else {
    const resources = [...plan.landscape_images, ...plan.square_images, ...plan.logos, plan.audience];
    if (resources.some(resource => !resource.startsWith(`${prefix}/`))) throw new ProviderError('rejected', 'asset_ownership');
    operations.push({adGroupCriterionOperation: {create: {adGroup, status: 'PAUSED', audience: {audience: plan.audience}}}});
    operations.push({adGroupAdOperation: {create: {adGroup, status: 'PAUSED', ad: {
      finalUrls: [plan.final_url], demandGenMultiAssetAd: {
        businessName: plan.business_name, headlines: plan.headlines.map(text => ({text})),
        descriptions: plan.descriptions.map(text => ({text})),
        marketingImages: plan.landscape_images.map(asset => ({asset})),
        squareMarketingImages: plan.square_images.map(asset => ({asset})), logoImages: plan.logos.map(asset => ({asset})),
      },
    }}}});
  }
  return operations;
}

/** Every mutation is sent once. An uncertain response is reconciled with reads only. */
export class Google {
  private accessToken: string | null = null;
  constructor(private env: GoogleCredentials, private scope: Scope, private fetcher: typeof fetch = (input,init)=>fetch(input,init)) {}
  private async token() {
    if (this.accessToken) return this.accessToken;
    const response = await this.fetcher('https://oauth2.googleapis.com/token', {method: 'POST', redirect: 'manual',
      signal: AbortSignal.timeout(5000), headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({client_id: this.env.GOOGLE_ADS_CLIENT_ID,
        client_secret: this.env.GOOGLE_ADS_CLIENT_SECRET, refresh_token: this.env.GOOGLE_ADS_REFRESH_TOKEN,
        grant_type: 'refresh_token'}).toString()});
    if(!response.ok){await response.body?.cancel();throw new ProviderError('unavailable','google_connection');}
    const body = await boundedJson(response, 8192);
    if (!response.ok || typeof body.access_token !== 'string') throw new ProviderError('unavailable', 'google_connection');
    return this.accessToken = body.access_token;
  }
  private async request(method: string, body: Json, writing = false): Promise<Json> {
    const token = await this.token();
    try {
      const response = await this.fetcher(`https://googleads.googleapis.com/v25/customers/${this.scope.platformAccountId}/${method}`, {
        method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(10_000),
        headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
          ...(this.env.GOOGLE_ADS_DEVELOPER_TOKEN ? {'developer-token': this.env.GOOGLE_ADS_DEVELOPER_TOKEN} : {}),
          ...(this.scope.googleLoginCustomerId ? {'login-customer-id': this.scope.googleLoginCustomerId} : {})},
        body: JSON.stringify(body),
      });
      const value = await boundedJson(response, 262_144);
      if (!response.ok || value.error) {
        const codes:string[]=(value.error?.details??[]).flatMap((detail:Json)=>(detail.errors??[]).flatMap((error:Json)=>Object.values(error.errorCode??{})))
          .filter((code:unknown):code is string=>typeof code==='string'&&/^[A-Z][A-Z0-9_]{1,80}$/.test(code)).slice(0,2);
        const code=codes.length?`google_${codes.join('_')}`:'google_response';
        // Only a complete structured 4xx rejection proves that the atomic request was rejected.
        if (writing && response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429 && value.error)
          throw new ProviderError('rejected',code);
        throw new ProviderError(writing ? 'unknown' : 'unavailable',code);
      }
      return value;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(writing ? 'unknown' : 'unavailable', 'google_response');
    }
  }
  async query(query: string): Promise<Json[]> {
    const response = await this.request('googleAds:search', {query});
    if (response.nextPageToken || response.results !== undefined && !Array.isArray(response.results)) throw new ProviderError('unavailable', 'readback_incomplete');
    return response.results ?? [];
  }
  async referenceAssets(){
    const account=await this.query('SELECT customer.id,customer.currency_code,customer.time_zone,customer.manager FROM customer LIMIT 1');
    if(account.length!==1||account[0].customer.id!==this.scope.platformAccountId||account[0].customer.manager)throw new ProviderError('unavailable','account_configuration');
    const reference:Json={account:account[0].customer,sources:[],missing:[],provider_action:false};
    const types=['RESPONSIVE_SEARCH_AD','DEMAND_GEN_MULTI_ASSET_AD'];
    const sources=await Promise.all(types.map(async type=>{
      const fields=type==='RESPONSIVE_SEARCH_AD'?'ad_group_ad.ad.responsive_search_ad.headlines,ad_group_ad.ad.responsive_search_ad.descriptions':'ad_group_ad.ad.demand_gen_multi_asset_ad.headlines,ad_group_ad.ad.demand_gen_multi_asset_ad.descriptions,ad_group_ad.ad.demand_gen_multi_asset_ad.business_name,ad_group_ad.ad.demand_gen_multi_asset_ad.marketing_images,ad_group_ad.ad.demand_gen_multi_asset_ad.square_marketing_images,ad_group_ad.ad.demand_gen_multi_asset_ad.logo_images';
      const rows=await this.query(`SELECT campaign.id,campaign.status,ad_group.id,ad_group_ad.ad.id,ad_group_ad.ad.type,ad_group_ad.ad.final_urls,${fields} FROM ad_group_ad WHERE ad_group_ad.ad.type = '${type}' AND ad_group_ad.status != 'REMOVED' AND ad_group.status != 'REMOVED' AND campaign.status != 'REMOVED' ORDER BY campaign.id DESC LIMIT 1`);
      if(!rows.length)return null;
      const row=rows[0];
      const [targets,keywords,campaignTargets]=await Promise.all([
        this.query(type==='RESPONSIVE_SEARCH_AD'?`SELECT campaign_criterion.type,campaign_criterion.negative,campaign_criterion.location.geo_target_constant,campaign_criterion.language.language_constant FROM campaign_criterion WHERE campaign.id = ${row.campaign.id}`:
          `SELECT ad_group_criterion.type,ad_group_criterion.status,ad_group_criterion.location.geo_target_constant,ad_group_criterion.language.language_constant,ad_group_criterion.audience.audience FROM ad_group_criterion WHERE ad_group.id = ${row.adGroup.id} AND ad_group_criterion.status != 'REMOVED'`),
        type==='RESPONSIVE_SEARCH_AD'?this.query(`SELECT ad_group_criterion.keyword.text,ad_group_criterion.keyword.match_type FROM keyword_view WHERE ad_group.id = ${row.adGroup.id} AND ad_group_criterion.status != 'REMOVED' LIMIT 20`):Promise.resolve([]),
        type==='RESPONSIVE_SEARCH_AD'?Promise.resolve(null):this.query(`SELECT campaign_criterion.type,campaign_criterion.negative,campaign_criterion.location.geo_target_constant,campaign_criterion.language.language_constant FROM campaign_criterion WHERE campaign.id = ${row.campaign.id}`),
      ]);
      const ad=row.adGroupAd.ad,creative=ad.responsiveSearchAd??ad.demandGenMultiAssetAd;
      return {campaign:row.campaign,ad_group:row.adGroup,ad:{id:ad.id,type:ad.type,final_urls:ad.finalUrls,
        headlines:creative.headlines.map((v:Json)=>v.text),descriptions:creative.descriptions.map((v:Json)=>v.text),
        ...(type==='DEMAND_GEN_MULTI_ASSET_AD'?{business_name:creative.businessName,landscape_images:creative.marketingImages.map((v:Json)=>v.asset),square_images:creative.squareMarketingImages.map((v:Json)=>v.asset),logos:creative.logoImages.map((v:Json)=>v.asset)}:{})},targeting:targets,campaign_targeting:campaignTargets??targets,keywords:keywords.map(row=>row.adGroupCriterion.keyword)};
    }));
    sources.forEach((source,index)=>source?reference.sources.push(source):reference.missing.push(types[index]));
    return reference;
  }
  async validate(plan: Plan, workflowId: string) {
    const [account] = await this.query('SELECT customer.id,customer.currency_code,customer.time_zone,customer.manager FROM customer LIMIT 1');
    if (!account || account.customer.id !== this.scope.platformAccountId || account.customer.currencyCode !== plan.currency ||
      account.customer.timeZone !== plan.timezone || account.customer.manager) throw new ProviderError('rejected', 'account_configuration');
    if (plan.campaign_type === 'demand_gen') {
      const ids = [...new Set([...plan.landscape_images, ...plan.square_images, ...plan.logos])].map(v => v.split('/').at(-1));
      const assets = await this.query(`SELECT asset.resource_name,asset.type,asset.image_asset.full_size.width_pixels,asset.image_asset.full_size.height_pixels FROM asset WHERE asset.id IN (${ids.join(',')})`);
      const byName = new Map(assets.map(row => [row.asset.resourceName, row.asset]));
      const checkImages = (references: string[], ratio: number, minimumWidth: number, minimumHeight: number) => references.every(reference => {
        const asset = byName.get(reference), size = asset?.imageAsset?.fullSize;
        return asset?.type === 'IMAGE' && Number(size?.widthPixels) >= minimumWidth && Number(size?.heightPixels) >= minimumHeight &&
          Math.abs(Number(size.widthPixels) / Number(size.heightPixels) - ratio) <= 0.02;
      });
      if (!checkImages(plan.landscape_images, 1.91, 600, 314) || !checkImages(plan.square_images, 1, 300, 300) ||
        !checkImages(plan.logos, 1, 144, 144)) throw new ProviderError('rejected', 'image_specifications');
      const audiences = await this.query(`SELECT audience.resource_name,audience.status FROM audience WHERE audience.id = ${plan.audience.split('/').at(-1)}`);
      if (audiences.length !== 1 || audiences[0].audience.resourceName !== plan.audience || audiences[0].audience.status !== 'ENABLED')
        throw new ProviderError('rejected', 'audience_unavailable');
    }
    await this.request('googleAds:mutate', {mutateOperations: buildOperations(this.scope, plan, workflowId),
      validateOnly: true, partialFailure: false});
  }
  async create(plan: Plan, workflowId: string): Promise<string[]> {
    const operations = buildOperations(this.scope, plan, workflowId);
    const response = await this.request('googleAds:mutate', {mutateOperations: operations, validateOnly: false,
      partialFailure: false, responseContentType: 'RESOURCE_NAME_ONLY'}, true);
    const results = response.mutateOperationResponses;
    if (!Array.isArray(results) || results.length !== operations.length || response.partialFailureError)
      throw new ProviderError('unknown', 'creation_receipt_incomplete');
    const names: string[] = results.map(row => Object.values(row).find((v: any) => typeof v?.resourceName === 'string'))
      .map((v: any) => v?.resourceName);
    if (names.some(name => typeof name !== 'string' || !name.startsWith(`customers/${this.scope.platformAccountId}/`)))
      throw new ProviderError('unknown', 'creation_receipt_incomplete');
    return names;
  }
  async qa(plan:Plan,workflowId:string){
    await this.validate(plan,workflowId);
    const data=await this.readback(plan,workflowId);
    const policy=await this.query(`SELECT ad_group_ad.resource_name,ad_group_ad.policy_summary.approval_status FROM ad_group_ad WHERE ad_group.id = ${data.ad_group.id} AND ad_group_ad.status != 'REMOVED'`);
    if(policy.length!==1||policy[0].adGroupAd.resourceName!==data.ad.resourceName||policy[0].adGroupAd.policySummary?.approvalStatus!=='APPROVED')throw new ProviderError('unavailable','google_qa_policy');
    return {...data,conversion_configuration:await this.conversionConfiguration(String(data.campaign.id))};
  }
  async schedule(snapshot:Json,date:string){
    const operations:Json[]=[
      {campaignOperation:{update:{resourceName:snapshot.campaign.resourceName,status:'ENABLED',startDateTime:date+' 00:00:00'},updateMask:'status,start_date_time'}},
      {adGroupOperation:{update:{resourceName:snapshot.ad_group.resourceName,status:'ENABLED'},updateMask:'status'}},
      {adGroupAdOperation:{update:{resourceName:snapshot.ad.resourceName,status:'ENABLED'},updateMask:'status'}},
      ...snapshot.targeting.filter((row:Json)=>['KEYWORD','LOCATION','LANGUAGE','AUDIENCE'].includes(row.adGroupCriterion.type)).map((row:Json)=>({adGroupCriterionOperation:{update:{resourceName:row.adGroupCriterion.resourceName,status:'ENABLED'},updateMask:'status'}})),
    ];
    if(operations.some(op=>{const value=Object.values(op)[0] as Json;return typeof value.update.resourceName!=='string'||!value.update.resourceName.startsWith(`customers/${this.scope.platformAccountId}/`);}))throw new ProviderError('rejected','schedule_ownership');
    await this.request('googleAds:mutate',{mutateOperations:operations,partialFailure:false,validateOnly:false},true);
  }
  async clonePlan(campaignId:string){
    if(!/^\d{1,20}$/.test(campaignId))throw new ProviderError('rejected','unsupported_structure');
    const conversion=await this.conversionConfiguration(campaignId);
    const rows=await this.query(`SELECT campaign.id,campaign.name,campaign.advertising_channel_type,campaign_budget.amount_micros,customer.currency_code,customer.time_zone FROM campaign WHERE campaign.id = ${campaignId}`);
    if(rows.length!==1||!['SEARCH','DEMAND_GEN'].includes(rows[0].campaign.advertisingChannelType))throw new ProviderError('rejected','unsupported_structure');
    const groups=await this.query(`SELECT ad_group.id,ad_group.name FROM ad_group WHERE campaign.id = ${campaignId} AND ad_group.status != 'REMOVED'`);
    if(groups.length!==1)throw new ProviderError('rejected','unsupported_structure');
    const group=groups[0].adGroup;
    const ads=await this.query(`SELECT ad_group_ad.ad.type,ad_group_ad.ad.final_urls,ad_group_ad.ad.responsive_search_ad.headlines,ad_group_ad.ad.responsive_search_ad.descriptions,ad_group_ad.ad.demand_gen_multi_asset_ad.headlines,ad_group_ad.ad.demand_gen_multi_asset_ad.descriptions,ad_group_ad.ad.demand_gen_multi_asset_ad.business_name,ad_group_ad.ad.demand_gen_multi_asset_ad.marketing_images,ad_group_ad.ad.demand_gen_multi_asset_ad.square_marketing_images,ad_group_ad.ad.demand_gen_multi_asset_ad.logo_images FROM ad_group_ad WHERE ad_group.id = ${group.id} AND ad_group_ad.status != 'REMOVED'`);
    if(ads.length!==1)throw new ProviderError('rejected','unsupported_structure');
    const ad=ads[0].adGroupAd.ad,search=rows[0].campaign.advertisingChannelType==='SEARCH',creative=search?ad.responsiveSearchAd:ad.demandGenMultiAssetAd;
    if(!creative||ad.finalUrls?.length!==1)throw new ProviderError('rejected','unsupported_structure');
    const targets=await this.query(search?`SELECT campaign_criterion.type,campaign_criterion.location.geo_target_constant,campaign_criterion.language.language_constant FROM campaign_criterion WHERE campaign.id = ${campaignId}`:`SELECT ad_group_criterion.type,ad_group_criterion.location.geo_target_constant,ad_group_criterion.language.language_constant,ad_group_criterion.audience.audience FROM ad_group_criterion WHERE ad_group.id = ${group.id} AND ad_group_criterion.status != 'REMOVED'`);
    const criteria=targets.map(row=>search?row.campaignCriterion:row.adGroupCriterion);
    const keywords=search?await this.query(`SELECT ad_group_criterion.keyword.text FROM keyword_view WHERE ad_group.id = ${group.id} AND ad_group_criterion.status != 'REMOVED'`):[];
    const plan=planSchema.parse({name:rows[0].campaign.name,campaign_type:search?'search':'demand_gen',currency:rows[0].customer.currencyCode,timezone:rows[0].customer.timeZone,
      daily_budget:String(Number(rows[0].campaignBudget.amountMicros)/1e6),final_url:ad.finalUrls[0],ad_group_name:group.name,
      locations:criteria.filter(c=>c.type==='LOCATION').map(c=>c.location.geoTargetConstant),languages:criteria.filter(c=>c.type==='LANGUAGE').map(c=>c.language.languageConstant),
      headlines:creative.headlines.map((v:Json)=>v.text),descriptions:creative.descriptions.map((v:Json)=>v.text),
      ...(search?{keywords:keywords.map(row=>row.adGroupCriterion.keyword.text)}:{business_name:creative.businessName,landscape_images:creative.marketingImages.map((v:Json)=>v.asset),square_images:creative.squareMarketingImages.map((v:Json)=>v.asset),logos:creative.logoImages.map((v:Json)=>v.asset),audience:criteria.find(c=>c.type==='AUDIENCE')?.audience.audience})});
    // Only the exact supported paused single-group/single-ad structure is cloneable in V1.
    const snapshot=await this.readback(plan,'',{campaignId});
    return {plan,snapshot:{...snapshot,conversion_configuration:conversion}};
  }
  async conversionConfiguration(campaignId:string){
    if(!/^\d+$/.test(campaignId))throw new ProviderError('rejected','conversion_ownership');
    const rows=await this.query(`SELECT conversion_goal_campaign_config.campaign,conversion_goal_campaign_config.goal_config_level,conversion_goal_campaign_config.custom_conversion_goal FROM conversion_goal_campaign_config WHERE campaign.id = ${campaignId}`);
    const config=rows[0]?.conversionGoalCampaignConfig;
    if(rows.length!==1||config?.campaign!==`customers/${this.scope.platformAccountId}/campaigns/${campaignId}`||config.goalConfigLevel!=='CUSTOMER'||config.customConversionGoal)throw new ProviderError('rejected','unsupported_conversion_configuration');
    const goals=await this.query('SELECT customer_conversion_goal.category,customer_conversion_goal.origin,customer_conversion_goal.biddable FROM customer_conversion_goal');
    const actions=await this.query('SELECT conversion_action.resource_name,conversion_action.status,conversion_action.category,conversion_action.origin,conversion_action.primary_for_goal FROM conversion_action WHERE conversion_action.status != \'REMOVED\'');
    return {config,goals:goals.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),actions:actions.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))};
  }
  async readback(plan: Plan, workflowId: string,options:{campaignId?:string;scheduledDate?:string}={}) {
    // A generated immutable UUID marker permits read-only reconciliation after a lost response.
    const name = providerName(plan, workflowId).replaceAll('\\', '\\\\').replaceAll("'", "\\'");
    const campaigns = await this.query(`SELECT campaign.resource_name,campaign.id,campaign.name,campaign.status,${options.scheduledDate?'campaign.start_date_time,':''}campaign.advertising_channel_type,campaign.bidding_strategy_type,campaign.geo_target_type_setting.positive_geo_target_type,campaign.geo_target_type_setting.negative_geo_target_type,campaign.contains_eu_political_advertising,campaign.network_settings.target_google_search,campaign.network_settings.target_search_network,campaign.network_settings.target_content_network,campaign.network_settings.target_partner_search_network,campaign.campaign_budget,campaign_budget.resource_name,campaign_budget.amount_micros,campaign_budget.explicitly_shared,campaign_budget.reference_count,campaign_budget.period FROM campaign WHERE ${options.campaignId?`campaign.id = ${options.campaignId}`:`campaign.name = '${name}'`} AND campaign.status != 'REMOVED'`);
    if (campaigns.length !== 1) throw new ProviderError('unknown', 'creation_readback');
    const row = campaigns[0], campaign = row.campaign, budget = row.campaignBudget;
    const expectedStatus=options.scheduledDate?'ENABLED':'PAUSED';
    if (options.scheduledDate&&campaign.startDateTime!==options.scheduledDate+' 00:00:00')throw new ProviderError('unknown','schedule_readback');
    if (!/^\d+$/.test(String(campaign.id)) || campaign.status !== expectedStatus || campaign.advertisingChannelType !== (plan.campaign_type === 'search' ? 'SEARCH' : 'DEMAND_GEN') ||
      campaign.biddingStrategyType !== (plan.campaign_type === 'search' ? 'TARGET_SPEND' : 'MAXIMIZE_CONVERSIONS') ||
      campaign.containsEuPoliticalAdvertising !== 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING' ||
      campaign.campaignBudget !== budget.resourceName || budget.explicitlyShared !== false || String(budget.referenceCount) !== '1' ||
      budget.period !== 'DAILY' || BigInt(budget.amountMicros) !== BigInt(Math.round(Number(plan.daily_budget) * 1e6)))
      throw new ProviderError('unknown', 'creation_readback');
    const groups = await this.query(`SELECT ad_group.resource_name,ad_group.id,ad_group.name,ad_group.status,ad_group.campaign FROM ad_group WHERE campaign.id = ${campaign.id} AND ad_group.status != 'REMOVED'`);
    if (groups.length !== 1 || !/^\d+$/.test(String(groups[0].adGroup.id)) || groups[0].adGroup.status !== expectedStatus || groups[0].adGroup.campaign !== campaign.resourceName ||
      groups[0].adGroup.name !== plan.ad_group_name) throw new ProviderError('unknown', 'creation_readback');
    const group = groups[0].adGroup;
    const adFields = plan.campaign_type === 'search' ? 'ad_group_ad.ad.responsive_search_ad.headlines,ad_group_ad.ad.responsive_search_ad.descriptions' : 'ad_group_ad.ad.demand_gen_multi_asset_ad.headlines,ad_group_ad.ad.demand_gen_multi_asset_ad.descriptions,ad_group_ad.ad.demand_gen_multi_asset_ad.business_name,ad_group_ad.ad.demand_gen_multi_asset_ad.marketing_images,ad_group_ad.ad.demand_gen_multi_asset_ad.square_marketing_images,ad_group_ad.ad.demand_gen_multi_asset_ad.logo_images';
    const ads = await this.query(`SELECT ad_group_ad.resource_name,ad_group_ad.status,ad_group_ad.ad.final_urls,ad_group_ad.ad.type,${adFields} FROM ad_group_ad WHERE ad_group.id = ${group.id} AND ad_group_ad.status != 'REMOVED'`);
    if (ads.length !== 1 || ads[0].adGroupAd.status !== expectedStatus || ads[0].adGroupAd.ad.finalUrls?.[0] !== plan.final_url ||
      ads[0].adGroupAd.ad.type !== (plan.campaign_type === 'search' ? 'RESPONSIVE_SEARCH_AD' : 'DEMAND_GEN_MULTI_ASSET_AD'))
      throw new ProviderError('unknown', 'creation_readback');
    const equal = (a: string[], b: string[]) => Array.isArray(a) && a.length === b.length && JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
    const ad = ads[0].adGroupAd.ad, creative = plan.campaign_type === 'search' ? ad.responsiveSearchAd : ad.demandGenMultiAssetAd;
    if (!creative || !equal((creative.headlines ?? []).map((v: Json) => v.text), plan.headlines) ||
      !equal((creative.descriptions ?? []).map((v: Json) => v.text), plan.descriptions) || !equal(ad.finalUrls, [plan.final_url]))
      throw new ProviderError('unknown', 'creative_readback');
    const allCriteria = await this.query(`SELECT ad_group_criterion.resource_name,ad_group_criterion.criterion_id,ad_group_criterion.user_list.user_list,ad_group_criterion.status,ad_group_criterion.type,ad_group_criterion.negative,ad_group_criterion.bid_modifier,ad_group_criterion.keyword.text,ad_group_criterion.keyword.match_type,ad_group_criterion.location.geo_target_constant,ad_group_criterion.language.language_constant,ad_group_criterion.audience.audience FROM ad_group_criterion WHERE ad_group.id = ${group.id} AND ad_group_criterion.status != 'REMOVED'`);
    // Google adds demographic defaults. These stay non-serving under the paused group,
    // campaign and ad; explicitly created keywords/location/language/audience must be paused.
    const defaultTypes = new Set(['GENDER', 'PARENTAL_STATUS', 'AGE_RANGE', 'INCOME_RANGE']);
    const defaults = allCriteria.filter(row => defaultTypes.has(row.adGroupCriterion.type));
    if (defaults.some(row => row.adGroupCriterion.negative || !['ENABLED', 'PAUSED'].includes(row.adGroupCriterion.status) ||
      row.adGroupCriterion.bidModifier !== undefined && Number(row.adGroupCriterion.bidModifier) !== 1))
      throw new ProviderError('unknown', 'targeting_readback');
    // Google expands a Demand Gen Audience into derived USER_LIST criteria, including
    // exclusions. Accept only the exact current audience members, never arbitrary extras.
    const derived = plan.campaign_type === 'demand_gen' ? allCriteria.filter(row => row.adGroupCriterion.type === 'USER_LIST') : [];
    if(plan.campaign_type === 'demand_gen' && derived.length){
      const audiences=await this.query(`SELECT audience.resource_name,audience.dimensions,audience.exclusion_dimension FROM audience WHERE audience.resource_name = '${plan.audience}'`);
      const audience=audiences[0]?.audience;
      if(audiences.length!==1||audience?.resourceName!==plan.audience)throw new ProviderError('unknown','targeting_readback');
      const included=(audience.dimensions??[]).flatMap((dimension:Json)=>dimension.audienceSegments?.segments??[]);
      const excluded=audience.exclusionDimension?.exclusions??[];
      if((audience.dimensions??[]).some((dimension:Json)=>!dimension.audienceSegments)||[...included,...excluded].some((segment:Json)=>!segment.userList?.userList))throw new ProviderError('unknown','targeting_readback');
      const expected=[...included.map((segment:Json)=>'include:'+segment.userList.userList),...excluded.map((segment:Json)=>'exclude:'+segment.userList.userList)];
      const actual=derived.map(row=>{const criterion=row.adGroupCriterion;return (criterion.negative?'exclude:':'include:')+criterion.userList?.userList;});
      if(!equal(actual,[...new Set(expected)])||derived.some(row=>!['ENABLED','PAUSED'].includes(row.adGroupCriterion.status)||row.adGroupCriterion.bidModifier!==undefined&&Number(row.adGroupCriterion.bidModifier)!==1))throw new ProviderError('unknown','targeting_readback');
    }
    const criteria = allCriteria.filter(row => !defaultTypes.has(row.adGroupCriterion.type)&&!derived.includes(row));
    if (criteria.some(row => row.adGroupCriterion.status !== expectedStatus || row.adGroupCriterion.negative)) throw new ProviderError('unknown', 'targeting_readback');
    if (plan.campaign_type === 'search') {
      const allTargeting = await this.query(`SELECT campaign_criterion.type,campaign_criterion.negative,campaign_criterion.bid_modifier,campaign_criterion.location.geo_target_constant,campaign_criterion.language.language_constant FROM campaign_criterion WHERE campaign.id = ${campaign.id}`);
      const devices = allTargeting.filter(row => row.campaignCriterion.type === 'DEVICE');
      if (devices.some(row => row.campaignCriterion.negative || row.campaignCriterion.bidModifier !== undefined && Number(row.campaignCriterion.bidModifier) !== 1))
        throw new ProviderError('unknown', 'targeting_readback');
      const targeting = allTargeting.filter(row => row.campaignCriterion.type !== 'DEVICE');
      const uniqueKeywords=[...new Set(plan.keywords)];
      if (!equal(targeting.filter(row => row.campaignCriterion.type === 'LOCATION' && !row.campaignCriterion.negative).map(row => row.campaignCriterion.location.geoTargetConstant), plan.locations) ||
        !equal(targeting.filter(row => row.campaignCriterion.type === 'LANGUAGE' && !row.campaignCriterion.negative).map(row => row.campaignCriterion.language.languageConstant), plan.languages) ||
        criteria.length !== uniqueKeywords.length || criteria.some(row => row.adGroupCriterion.keyword?.matchType !== 'EXACT') ||
        !equal(criteria.map(row => row.adGroupCriterion.keyword?.text), uniqueKeywords) || targeting.length !== plan.locations.length + plan.languages.length)
        throw new ProviderError('unknown', 'targeting_readback');
      if(campaign.geoTargetTypeSetting?.positiveGeoTargetType!=='PRESENCE'||campaign.geoTargetTypeSetting?.negativeGeoTargetType!=='PRESENCE')throw new ProviderError('unknown','targeting_readback');
      const network = campaign.networkSettings;
      if (!network?.targetGoogleSearch || network.targetSearchNetwork || network.targetContentNetwork || network.targetPartnerSearchNetwork)
        throw new ProviderError('unknown', 'network_readback');
    } else if (!equal((creative.marketingImages ?? []).map((v: Json) => v.asset), plan.landscape_images) ||
      !equal((creative.squareMarketingImages ?? []).map((v: Json) => v.asset), plan.square_images) ||
      !equal((creative.logoImages ?? []).map((v: Json) => v.asset), plan.logos) || creative.businessName !== plan.business_name ||
      !equal(criteria.filter(row => row.adGroupCriterion.type === 'LOCATION').map(row => row.adGroupCriterion.location.geoTargetConstant), plan.locations) ||
      !equal(criteria.filter(row => row.adGroupCriterion.type === 'LANGUAGE').map(row => row.adGroupCriterion.language.languageConstant), plan.languages) ||
      !equal(criteria.filter(row => row.adGroupCriterion.type === 'AUDIENCE').map(row => row.adGroupCriterion.audience.audience), [plan.audience]) ||
      criteria.length !== plan.locations.length + plan.languages.length + 1)
      throw new ProviderError('unknown', 'targeting_readback');
    return {campaign, budget, ad_group: group, ad: ads[0].adGroupAd, targeting: allCriteria, verified_at: new Date().toISOString()};
  }
}
