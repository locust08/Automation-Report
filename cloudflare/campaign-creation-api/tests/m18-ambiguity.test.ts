import {expect,it} from 'vitest';
import {Meta} from '../src/meta';
import type {Scope} from '../src/contracts';
const scope={platform:'Meta',platformAccountId:'123'} as Scope;
it('keeps unstructured and transient Meta errors readback-only after a mutation',async()=>{
 for(const response of [Response.json({}, {status:500}),Response.json({error:{code:100}},{status:408}),Response.json({error:{code:2}},{status:400}),Response.json({error:{code:2,is_transient:true}},{status:400}),Response.json({}, {status:400})]){
  const meta=new Meta({META_ACCESS_TOKEN:'synthetic',META_API_VERSION:'v25.0'},scope,async()=>response);
  await expect((meta as any).post('act_123/campaigns',{name:'fixture'})).rejects.toMatchObject({outcome:'unknown'});
 }
});
it('permits recovery only for an explicit authoritative nontransient rejection',async()=>{
 const meta=new Meta({META_ACCESS_TOKEN:'synthetic',META_API_VERSION:'v25.0'},scope,async()=>Response.json({error:{code:100,message:'Invalid parameter'}},{status:400}));
 await expect((meta as any).post('act_123/campaigns',{name:'fixture'})).rejects.toMatchObject({outcome:'rejected'});
});
