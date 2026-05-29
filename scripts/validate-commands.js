#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const COMMANDS_DIR = path.join(ROOT, 'commands');

const REQUIRED_SECTIONS = [
    '## Arguments',
    '## Preflight',
    '## Plan',
    '## Commands',
    '## Verification',
    '## Summary',
    '## Next Steps'
];

const fail = (messages) => {
    messages.forEach(message => console.error(message));
    process.exit(1);
};

const readCommandFiles = () => {
    if (!fs.existsSync(COMMANDS_DIR)) {
        return [];
    }
    return fs.readdirSync(COMMANDS_DIR)
        .filter(file => file.endsWith('.md'))
        .filter(file => !file.startsWith('_'))
        .sort();
};

const hasFrontmatterDescription = (content) => {
    const match = content.match(/^---\n([\s\S]*?)\n---\n/);
    if (!match) {
        return false;
    }
    return /^description:\s*.+$/m.test(match[1]);
};

const validateFile = (file) => {
    const errors = [];
    const commandName = file.replace(/\.md$/, '');
    const fullPath = path.join(COMMANDS_DIR, file);
    const content = fs.readFileSync(fullPath, 'utf8');

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(file)) {
        errors.push(`${file}: command files must use lower-case kebab-case names.`);
    }
    if (!hasFrontmatterDescription(content)) {
        errors.push(`${file}: missing YAML frontmatter with a description.`);
    }
    if (!content.includes(`# /${commandName}`)) {
        errors.push(`${file}: missing heading "# /${commandName}".`);
    }
    REQUIRED_SECTIONS.forEach(section => {
        if (!content.includes(section)) {
            errors.push(`${file}: missing required section "${section}".`);
        }
    });
    return errors;
};

const files = readCommandFiles();
const errors = files.flatMap(validateFile);

if (errors.length > 0) {
    fail(errors);
}

if (files.length === 0) {
    console.log('No runnable slash commands found. Meta files only.');
} else {
    console.log(`Validated ${files.length} slash command file(s).`);
}
