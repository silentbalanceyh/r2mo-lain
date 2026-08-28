const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const Ec = require('../epic');
const { parseBool, parseOptional } = require('../utils/mxt-args');

/**
 * Check if a command is available on the system.
 * @param {string} cmd - command name
 * @returns {boolean}
 */
const _isCommandAvailable = (cmd) => {
    try {
        const whereCmd = process.platform === 'win32' ? 'where' : 'which';
        execSync(`${whereCmd} ${cmd}`, { stdio: 'pipe' });
        return true;
    } catch (_) {
        return false;
    }
};

/**
 * Resolve the Python script path relative to this executor.
 * @returns {string}
 */
const _resolveScriptPath = () => {
    return path.resolve(__dirname, '..', 'python', 'mxt_doctor.py');
};

/**
 * Build the argument list for the Python script.
 * Handles shortcut flags: --genk8s, --genloc, --genmob, --genwin
 * @param {boolean} generate
 * @param {string|null} profile - null=omit, ''=empty(list), 'loc'=value
 * @param {boolean} genk8s - shortcut for --generate --profile k8s
 * @param {boolean} genloc - shortcut for --generate --profile loc
 * @param {boolean} genmob - shortcut for --generate --profile mob
 * @param {boolean} genwin - shortcut for --generate --profile win
 * @returns {string[]}
 */
const _buildArgs = (generate, profile, genk8s, genloc, genmob, genwin) => {
    const args = [];
    // Shortcut flags take priority — pass them directly to Python
    if (genk8s) { args.push('--genk8s'); return args; }
    if (genloc) { args.push('--genloc'); return args; }
    if (genmob) { args.push('--genmob'); return args; }
    if (genwin) { args.push('--genwin'); return args; }
    if (generate) {
        args.push('--generate');
    }
    if (profile !== null) {
        args.push('--profile');
        if (profile !== '') {
            args.push(profile);
        }
    }
    return args;
};

module.exports = async () => {
    // 1. Parse arguments
    const generate = parseBool('generate', 'g');
    const profileArg = parseOptional('profile', 'p');
    const genk8s = parseBool('genk8s', '');
    const genloc = parseBool('genloc', '');
    const genmob = parseBool('genmob', '');
    const genwin = parseBool('genwin', '');

    // Determine profile value:
    //   parseOptional returns { hasFlag, value }
    //   hasFlag=false, value=null  -> no --profile at all
    //   hasFlag=true,  value=null   -> --profile with empty value (list mode)
    //   hasFlag=true,  value='loc' -> --profile loc
    let profile = null;
    if (profileArg.hasFlag) {
        profile = profileArg.value || '';
    }

    // 2. Check Python3 availability
    const pyCmd = _isCommandAvailable('python3') ? 'python3' : 
                  _isCommandAvailable('python') ? 'python' : null;

    if (!pyCmd) {
        Ec.error('❌ Python3 is required but not found on PATH.');
        console.log('');
        console.log('  mxt doctor depends on Python3 to run the scanning engine.');
        console.log('  Please install Python3 and ensure it is available as "python3" or "python".');
        console.log('');
        console.log('  Install via Homebrew (macOS):'.gray);
        console.log('    brew install python3'.cyan);
        console.log('  Install via apt (Ubuntu/Debian):'.gray);
        console.log('    sudo apt install python3'.cyan);
        console.log('');
        process.exit(1);
    }

    // 3. Resolve script path
    const scriptPath = _resolveScriptPath();
    if (!fs.existsSync(scriptPath)) {
        Ec.error(`❌ Doctor script not found: ${scriptPath}`);
        process.exit(1);
    }

    // 4. Build command arguments
    const isShortcutGen = genk8s || genloc || genmob || genwin;
    const pyArgs = _buildArgs(generate, profile, genk8s, genloc, genmob, genwin);
    const fullArgs = [scriptPath, ...pyArgs];

    // 5. Print execution info
    const mode = (generate || isShortcutGen) ? 'GENERATE' : 'SCAN';
    let profileDesc;
    if (genk8s) profileDesc = 'k8s (shortcut)';
    else if (genloc) profileDesc = 'loc (shortcut)';
    else if (genmob) profileDesc = 'mob (shortcut)';
    else if (genwin) profileDesc = 'win (shortcut)';
    else profileDesc = profile === null ? '(default from config.json)' : 
                        profile === '' ? '(list profiles)' : profile;
    Ec.info(`🩺 mxt doctor — Mode: ${mode}, Profile: ${profileDesc}`);
    console.log(`  Python: ${pyCmd}`);
    console.log(`  Script: ${scriptPath}`);
    if (pyArgs.length > 0) {
        console.log(`  Args:   ${pyArgs.join(' ')}`);
    }
    console.log('');

    // 6. Spawn Python process with stdio inherit
    const child = spawn(pyCmd, fullArgs, {
        stdio: 'inherit',
        cwd: process.cwd(),
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    // 7. Handle process exit
    return new Promise((resolve) => {
        child.on('close', (code) => {
            if (code === 0) {
                // success - don't print extra, Python already printed summary
            } else {
                Ec.error(`❌ Doctor exited with code ${code}`);
            }
            process.exit(code || 0);
        });

        child.on('error', (err) => {
            Ec.error(`❌ Failed to execute Python: ${err.message}`);
            process.exit(1);
        });
    });
};
