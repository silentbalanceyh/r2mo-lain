const assert = require('node:assert/strict');
const vm = require('node:vm');
const {
    registrationCode,
    parseResult,
    findVaultByPath,
    registryPath,
    buildLaunchPlan
} = require('../src/utils/mxt-obsidian');

const registry = {
    vaults: {
        abcdef0123456789: { path: '/Users/lang/work/app-iia/.r2mo', open: true },
        fedcba9876543210: { path: '/Users/lang/work/app-webos/.r2mo', open: false }
    }
};
assert.equal(findVaultByPath('/Users/lang/work/app-iia/.r2mo', registry, 'darwin').id,
    'abcdef0123456789');
assert.equal(findVaultByPath('/Users/lang/work/./app-webos/.r2mo', registry, 'darwin').id,
    'fedcba9876543210');
assert.equal(findVaultByPath('C:\\Work\\APP-IIA\\.r2mo', {
    vaults: { winid: { path: 'c:\\work\\app-iia\\.r2mo', open: true } }
}, 'win32').id, 'winid');
assert.equal(findVaultByPath('/Users/lang/work/other/.r2mo', registry, 'darwin'), null);
assert.equal(registryPath('darwin', {}, '/Users/lang'),
    '/Users/lang/Library/Application Support/obsidian/obsidian.json');
assert.equal(registryPath('win32', { APPDATA: 'C:\\Users\\lang\\AppData\\Roaming' }, 'C:\\Users\\lang'),
    'C:\\Users\\lang\\AppData\\Roaming\\obsidian\\obsidian.json');
assert.deepEqual(buildLaunchPlan('darwin', 'abcdef0123456789'), {
    command: '/usr/bin/open', args: ['obsidian://open?vault=abcdef0123456789']
});
assert.deepEqual(buildLaunchPlan('win32', 'abcdef0123456789'), {
    command: 'rundll32.exe', args: ['url.dll,FileProtocolHandler', 'obsidian://open?vault=abcdef0123456789']
});

const vaults = {};
let serial = 0;
const ipcRenderer = { sendSync(action, target, create) {
    if (action === 'vault-list') return vaults;
    assert.equal(action, 'vault-open');
    assert.equal(create, false);
    let entry = Object.entries(vaults).find(([, vault]) => vault.path === target);
    if (!entry) {
        const id = (++serial).toString(16).padStart(16, '0');
        vaults[id] = { path: target };
        entry = [id, vaults[id]];
    }
    entry[1].open = true;
    return true;
} };
const run = target => {
    const response = vm.runInNewContext(registrationCode(target), { require: () => ({ ipcRenderer }) });
    return parseResult(`startup log\n=> ${response}\n`, target);
};
const first = run('/work/app-iia/.r2mo');
const second = run('/work/app-webos/.r2mo');
assert.notEqual(first.id, second.id);
assert.equal(run(first.path).id, first.id);
assert.equal(Object.keys(vaults).length, 2);
assert.equal(run('/work/引号" & #/.r2mo').path, '/work/引号" & #/.r2mo');
assert.throws(() => parseResult('startup succeeded', first.path));
assert.throws(() => parseResult(`=> MXT_VAULT_RESULT:${JSON.stringify(first)}`, second.path));
assert.throws(() => parseResult(`=> MXT_VAULT_RESULT:${JSON.stringify({ ...first, open: false })}`, first.path));
assert.throws(() => vm.runInNewContext(registrationCode(first.path), {
    require: () => ({ ipcRenderer: { sendSync: () => 'folder not found' } })
}), /folder not found/);
console.log('PASS: distinct paths, stable IDs, escaping, missing acknowledgement, wrong path, closed vault, IPC failure');

// Exercise orchestration without opening real applications.
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../src/utils/mxt-obsidian'), 'utf8');
const target = fs.realpathSync(process.cwd());
const id = '1234567890abcdef';
const fixture = (vaults) => {
    const calls = [];
    const execFile = () => {};
    execFile[require('node:util').promisify.custom] = async (...args) => {
        calls.push(args);
        return { stdout: `=> MXT_VAULT_RESULT:${JSON.stringify({ id, path: target, open: true })}` };
    };
    const sandbox = { module: { exports: {} }, process, require(name) {
        if (name === 'child_process') return { execFile };
        if (name === 'fs') return { ...fs, readFileSync: () => JSON.stringify({ vaults }) };
        return require(name);
    } };
    vm.runInNewContext(source, sandbox);
    return { api: sandbox.module.exports, calls };
};
(async () => {
    const known = fixture({ [id]: { path: target, open: false } });
    assert.equal((await known.api.openVault(target)).status, 'requested');
    assert.equal(known.calls.length, 1);
    assert.equal(known.calls[0][1].includes('eval'), false);
    assert.ok(known.calls[0][1].includes(`obsidian://open?vault=${id}`));
    const fresh = fixture({ [id]: { path: '/host', open: true } });
    assert.equal((await fresh.api.openVault(target)).status, 'confirmed');
    assert.equal(fresh.calls.length, 1);
    assert.equal(fresh.calls[0][1][0], `vault=${id}`);
    assert.equal(fresh.calls[0][2].killSignal, 'SIGKILL');
    const unavailable = fixture({});
    await assert.rejects(unavailable.api.openVault(target), /尚未注册/);
    assert.equal(unavailable.calls.length, 0);
    console.log('PASS: registered path bypasses eval; new path pins host; no host causes no launch');
})().catch(error => { console.error(error); process.exitCode = 1; });
