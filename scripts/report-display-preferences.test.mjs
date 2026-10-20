import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../app/api/user/report-display-preferences/route.ts', import.meta.url), 'utf8');
function routes(session, repository = async () => ({ overall: true, campaign: true, advanced: true })) {
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  new Function('require', 'exports', output)((name) => {
    if (name === 'next/server') return { NextResponse: { json: (body, init) => Response.json(body, init) } };
    if (name.includes('server-session')) return { getServerAuthSession: async () => session };
    if (name.includes('display-preferences-repository')) return { reportingPreferences: repository };
    return require(name);
  }, exports);
  return exports;
}
const request = body => new Request('http://localhost/api/user/report-display-preferences', { method: 'PATCH', body: JSON.stringify(body) });
test('signed-out reads and writes are denied before accessing storage', async () => {
  const api = routes(null, () => assert.fail('Storage must not be accessed'));
  assert.equal((await api.GET()).status, 401);
  assert.equal((await api.PATCH(request({ overall: false }))).status, 401);
});
test('every role can save only its session owner preferences', async () => {
  for (const role of ['user', 'pms', 'co', 'specialist', 'approver', 'tl', 'pm', 'admin']) {
    let call;
    const api = routes({ sub: 'owner-' + role, role }, async (id, patch) => { call = { id, patch }; return { overall: false, campaign: true, advanced: true }; });
    assert.equal((await api.PATCH(request({ overall: false }))).status, 200);
    assert.deepEqual(call, { id: 'owner-' + role, patch: { overall: false } });
    assert.equal((await api.GET()).status, 200);
    assert.equal(call.id, 'owner-' + role);
  }
});
test('rejects forged ownership, unknown keys, empty and invalid values', async () => {
  const api = routes({ sub: 'owner' }, () => assert.fail('Invalid writes must not reach storage'));
  for (const body of [{ user_id: 'victim', overall: false }, { role: 'admin' }, {}, { overall: 'false' }, { campaign: null }, { advanced: 0 }]) {
    assert.equal((await api.PATCH(request(body))).status, 400);
  }
});
test('storage failure is reported without leaking storage details', async () => {
  const api = routes({ sub: 'owner' }, () => { throw new Error('private storage details'); });
  for (const response of [await api.GET(), await api.PATCH(request({ advanced: false }))]) {
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /private storage/);
  }
});
test('basic user route access permits Settings and preference operations only', () => {
  const exports = {};
  const output = ts.transpileModule(readFileSync(new URL('../lib/auth/access.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('exports', output)(exports);
  const allowed = exports.isUserRoleRequestAllowed;
  assert.equal(allowed('/settings'), true);
  assert.equal(allowed('/api/user/report-display-preferences', 'GET'), true);
  assert.equal(allowed('/api/user/report-display-preferences', 'PATCH'), true);
  assert.equal(allowed('/api/user/report-display-preferences', 'DELETE'), false);
  assert.equal(allowed('/api/admin/workflow-settings', 'GET'), false);
  assert.equal(allowed('/api/admin/settings/exclusion-cap', 'PUT'), false);
});
test('Advanced growth comparisons disappear while volumes stay visible', async () => {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const source = readFileSync(new URL('../components/reporting/advanced-page-client.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('advanced.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = ['OpportunityList', 'RisingKeywordList', 'ChartPanel', 'CollapsibleReason', 'formatNumber', 'formatSignedPercent', 'formatPercentChange', 'normalizeDisplayNumber', 'formatDisplayPercent'];
  const functions = ast.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text)).map(n => n.getText(ast)).join('\n');
  const output = ts.transpileModule(functions, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
  const sample = {keyword:'Example',category:'Product',previousVolume:100,currentVolume:200,growthPercent:100,history:[],reason:'',hasRisingVolume:true};
  for (const show of [true, false]) {
    const components = new Function('require', 'useState', 'ComparisonPercentage', 'exports', output + '\nreturn {OpportunityList,RisingKeywordList};')(require, React.useState, ({children}) => show ? children : null, {});
    for (const Component of Object.values(components)) {
      const html = renderToStaticMarkup(React.createElement(Component,{title:'Growth',rows:[sample]}));
      assert.equal(html.includes('100.0%'),show);
      assert.match(html,/200/);
      assert.match(html,/Example/);
    }
  }
});
test('page preference mapping keeps other report rates outside these switches', () => {
  const source = readFileSync(new URL('../lib/reporting/display-preferences.ts', import.meta.url),'utf8');
  const exports = {};
  new Function('exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(exports);
  assert.deepEqual(exports.REPORT_DISPLAY_DEFAULTS,{overall:true,campaign:true,advanced:true});
  assert.equal(exports.reportDisplayPage('/overall'),'overall');
  assert.equal(exports.reportDisplayPage('/campaign/Search'),'campaign');
  assert.equal(exports.reportDisplayPage('/advanced'),'advanced');
  for(const path of ['/campaign-breakdown','/preview','/demand-gen','/auction']) assert.equal(exports.reportDisplayPage(path),null);
});
