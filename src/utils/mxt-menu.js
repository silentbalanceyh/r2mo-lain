/**
 * @module mxt-menu
 * 交互式菜单 (Raw Mode)
 */
const readline = require('readline');

// 使用更精确的光标控制
const clearScreen = () => {
    // 清屏并移动到左上角
    process.stdout.write('\x1B[2J\x1B[0f');
};

const _baseSelect = (items, title, isMulti, header) => new Promise(resolve => {
    let cursor = 0;
    const selected = new Array(items.length).fill(false);
    const maxLen = Math.max(...items.map(i => (i.name||'').length), 4);

    const render = () => {
        // 清屏并移动到左上角（使用组合命令确保光标位置正确）
        process.stdout.write('\x1B[2J\x1B[H');
        // 输出内容
        process.stdout.write(`\n[MXT AI]`.blue.bold + ` ====== ${title} ======`.blue + '\n');
        if (header) process.stdout.write(header + '\n');
        items.forEach((item, i) => {
            const active = i === cursor, check = isMulti ? (selected[i] ? '[✓]'.green : '[ ]') : '';
            const nameStr = (item.name||'').padEnd(maxLen);
            const nameDisplay = active ? nameStr.cyan.bold : nameStr;
            process.stdout.write(`  ${active ? '▸'.cyan : ' '} ${check} ${nameDisplay}  ${(item.description||'').gray}\n`);
        });
        process.stdout.write('\n  ' + (isMulti ? 'Space:切换  A:全选  N:取消  ' : '') + 'Enter:确定  Q:退出'.gray + '\n');
    };

    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    render();

    const onKey = (str, key) => {
        if (!key) return;
        if ((key.ctrl && key.name === 'c') || key.name === 'q' || key.name === 'escape') {
            cleanup(); resolve(isMulti ? { indices: [], items: [] } : null); return;
        }
        if (key.name === 'up') { 
            cursor = cursor > 0 ? cursor - 1 : items.length - 1; 
            render(); 
        }
        if (key.name === 'down') { 
            cursor = cursor < items.length - 1 ? cursor + 1 : 0; 
            render(); 
        }
        if (isMulti) {
            if (key.name === 'space') { 
                selected[cursor] = !selected[cursor]; 
                render(); 
            }
            if (key.name === 'a') { 
                selected.fill(true); 
                render(); 
            }
            if (key.name === 'n') { 
                selected.fill(false); 
                render(); 
            }
        }
        if (key.name === 'return') {
            cleanup();
            if (!isMulti) resolve(items[cursor]);
            else {
                const indices = selected.map((v, i) => v ? i : -1).filter(i => i !== -1);
                if (indices.length === 0) {
                    resolve({ indices: [cursor], items: [items[cursor]] });
                } else {
                    resolve({ indices, items: items.filter((_, i) => selected[i]) });
                }
            }
        }
    };

    const cleanup = () => { 
        process.stdin.setRawMode(false); 
        process.stdin.removeListener('keypress', onKey); 
        // 清理时只清屏，不移动光标
        process.stdout.write('\x1B[2J');
        process.stdout.write('\x1B[H');
    };
    process.stdin.on('keypress', onKey);
});

module.exports = {
    selectMultiple: (items, title, header) => _baseSelect(items, title || '选择选项', true, header),
    selectSingle: (items, title, header) => _baseSelect(items, title || '选择一项', false, header),
    clearScreen
};