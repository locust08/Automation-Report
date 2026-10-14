import assert from "node:assert/strict";
import test from "node:test";
import {confirmationBindingFields, tagConfirmationBinding, compareConfirmationBinding, type ConfirmationBindingValues} from "./confirmation-binding";

test("private nonce-keyed tags identify every changed binding without returning values or tags",async()=>{
 const values=Object.fromEntries(confirmationBindingFields.map(field=>[field,`private-${field}`])) as ConfirmationBindingValues;
 const key=new TextEncoder().encode("synthetic-test-only-signing-key-123456789"),nonce=crypto.randomUUID();
 const tags=await tagConfirmationBinding(values,key,nonce);
 assert.deepEqual(await compareConfirmationBinding(tags,values,key,nonce),[]);
 for(const field of confirmationBindingFields){
  const labels=await compareConfirmationBinding(tags,{...values,[field]:"changed-private-value"},key,nonce);
  assert.deepEqual(labels,[field]);assert.doesNotMatch(JSON.stringify(labels),/private|[a-f0-9]{64}/);
 }
 assert.notDeepEqual(await tagConfirmationBinding(values,key,crypto.randomUUID()),tags);
 assert.notDeepEqual(await tagConfirmationBinding(values,new TextEncoder().encode("different-private-signing-key-123456789"),nonce),tags);
});
