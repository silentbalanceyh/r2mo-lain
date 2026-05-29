const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const AUDIO_PLAYERS = [
    { command: 'afplay', platform: 'darwin', args: (audioPath) => [audioPath] },
    { command: 'ffplay', args: (audioPath) => ['-nodisp', '-autoexit', '-loglevel', 'error', audioPath] },
    { command: 'powershell.exe', platform: 'win32', args: (audioPath) => ['-c', `(New-Object Media.SoundPlayer '${audioPath}').PlaySync()`] }
];

const _isCommandAvailable = (command) => {
    const checker = process.platform === 'win32' ? 'where' : 'which';
    const result = spawnSync(checker, [command], { stdio: 'ignore', shell: process.platform === 'win32' });
    return result.status === 0;
};

const _playWith = (player, audioPath) => {
    try {
        const child = spawn(player.command, player.args(audioPath), {
            stdio: 'ignore',
            detached: true,
            shell: process.platform === 'win32'
        });
        child.on('error', () => {});
        child.unref();
        return true;
    } catch (_) {
        return false;
    }
};

const playAudio = (relativeAudioPath) => {
    const audioPath = path.resolve(__dirname, '..', relativeAudioPath);
    if (!fs.existsSync(audioPath)) {
        return false;
    }
    for (const player of AUDIO_PLAYERS) {
        if (player.platform && player.platform !== process.platform) {
            continue;
        }
        if (!_isCommandAvailable(player.command)) {
            continue;
        }
        if (_playWith(player, audioPath)) {
            return true;
        }
    }
    return false;
};

module.exports = { playAudio };
