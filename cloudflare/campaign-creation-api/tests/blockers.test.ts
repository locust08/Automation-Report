import {expect,it} from 'vitest';
import {campaignBlocker} from '../src/blockers';
it('returns actionable safe blockers without exposing provider payloads',()=>{
 expect(campaignBlocker('meta_rate_limited')).toMatchObject({code:'meta_rate_limited',message:expect.stringContaining('rate limit')});
 expect(campaignBlocker('tiktok_asset_review').message).toContain('identity');
 expect(campaignBlocker('provider_creation_disabled').message).toContain('disabled');
 expect(campaignBlocker('secret=abc').message).not.toContain('secret');
});
