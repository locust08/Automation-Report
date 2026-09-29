import {expect,it} from 'vitest';
import {Store} from '../src/store';
import {database} from './db';

it('records each Meta write intent before dispatch and never claims it twice',async()=>{
  const fixture=await database(),store=new Store(fixture.db),operation=crypto.randomUUID();
  try{
    expect(await store.beginProviderStep(operation,'campaign','name-a')).toEqual({status:'started',provider_id:null,claimed:true});
    expect(await store.beginProviderStep(operation,'campaign','name-a')).toEqual({status:'started',provider_id:null,claimed:false});
    await store.confirmProviderStep(operation,'campaign','123');
    expect(await store.beginProviderStep(operation,'campaign','name-a')).toEqual({status:'confirmed',provider_id:'123',claimed:false});
    await expect(store.beginProviderStep(operation,'campaign','name-b')).rejects.toThrow();
    await expect(store.confirmProviderStep(operation,'campaign','456')).rejects.toThrow();
  }finally{fixture.dispose();}
});
