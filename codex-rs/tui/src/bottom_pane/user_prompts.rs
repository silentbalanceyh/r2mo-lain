//! User-defined slash prompt commands loaded from `$CODEX_HOME/prompts`.
//!
//! Prompt files are plain Markdown. Optional YAML frontmatter provides the popup description;
//! the body is submitted as a normal model prompt. `$ARGUMENTS` is replaced by the text after
//! the command name.
use std::fs;
use std::path::Path;
use std::path::PathBuf;

use codex_utils_home_dir::find_codex_home;

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct UserPrompt {
    pub(crate) name: String,
    pub(crate) description: String,
    pub(crate) body: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ParsedUserPrompt {
    pub(crate) description: String,
    pub(crate) body: String,
}

pub(crate) fn discover_user_prompts(codex_home: &Path) -> Vec<UserPrompt> {
    let mut prompts = Vec::new();
    let prompts_dir = codex_home.join("prompts");
    let Ok(entries) = fs::read_dir(&prompts_dir) else {
        return prompts;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        if path.extension().and_then(|ext| ext.to_str()) != Some("md") {
            continue;
        }
        let Some(name) = path.file_stem().and_then(|stem| stem.to_str()) else {
            continue;
        };
        if name.is_empty()
            || name.starts_with('_')
            || name.starts_with('.')
            || name.contains('/')
            || name.contains(char::is_whitespace)
        {
            continue;
        }
        let Ok(contents) = fs::read_to_string(&path) else {
            continue;
        };
        let ParsedUserPrompt { description, body } = parse_user_prompt(&contents);
        prompts.push(UserPrompt {
            name: name.to_string(),
            description,
            body,
        });
    }

    prompts.sort_by(|left, right| left.name.cmp(&right.name));
    prompts.dedup_by(|left, right| left.name == right.name);
    prompts
}

pub(crate) fn default_user_prompts() -> Vec<UserPrompt> {
    find_codex_home()
        .map(|home| discover_user_prompts(home.as_path()))
        .unwrap_or_default()
}

pub(crate) fn parse_user_prompt(contents: &str) -> ParsedUserPrompt {
    let Some(body) = contents.strip_prefix("---\n") else {
        return ParsedUserPrompt {
            description: "Send a saved prompt".to_string(),
            body: contents.to_string(),
        };
    };
    let Some((frontmatter, body)) = body.split_once("\n---") else {
        return ParsedUserPrompt {
            description: "Send a saved prompt".to_string(),
            body: contents.to_string(),
        };
    };
    let body = body.strip_prefix('\n').unwrap_or(body);
    let description = frontmatter
        .lines()
        .find_map(|line| line.strip_prefix("description:"))
        .map(str::trim)
        .map(unquote)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "Send a saved prompt".to_string());
    ParsedUserPrompt {
        description,
        body: body.to_string(),
    }
}

pub(crate) fn expand_user_prompt(prompt: &UserPrompt, arguments: &str) -> String {
    prompt.body.replace("$ARGUMENTS", arguments)
}

fn unquote(value: &str) -> String {
    let bytes = value.as_bytes();
    if bytes.len() >= 2
        && ((bytes[0] == b'"' && bytes[bytes.len() - 1] == b'"')
            || (bytes[0] == b'\'' && bytes[bytes.len() - 1] == b'\''))
    {
        return value[1..value.len() - 1].to_string();
    }
    value.to_string()
}

pub(crate) fn prompt_path(codex_home: &Path, name: &str) -> PathBuf {
    codex_home.join("prompts").join(format!("{name}.md"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    #[test]
    fn parses_description_and_removes_frontmatter() {
        let parsed = parse_user_prompt(
            "---\ndescription: \"Do work\"\nargument-hint: \"input\"\n---\nBody $ARGUMENTS\n",
        );
        assert_eq!(parsed.description, "Do work");
        assert_eq!(parsed.body, "Body $ARGUMENTS\n");
    }

    #[test]
    fn expands_arguments_in_all_occurrences() {
        let prompt = UserPrompt {
            name: "mplan".to_string(),
            description: String::new(),
            body: "first $ARGUMENTS\nsecond $ARGUMENTS".to_string(),
        };
        assert_eq!(expand_user_prompt(&prompt, "001"), "first 001\nsecond 001");
    }
}
