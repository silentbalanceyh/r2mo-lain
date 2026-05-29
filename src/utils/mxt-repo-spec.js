/**
 * @module mxt-repo-spec
 * 与 mxt domain / mxt mmr0 / mxt mmr2 共享的 r2mo-spec 仓库配置。
 * 仓库名为 r2mo-spec，直接从 .r2mo/repo/r2mo-spec 加载，不做 rename。
 */
const REPO_SPEC_NAME = 'r2mo-spec';
const SPEC_REPO_URL = 'https://gitee.com/silentbalanceyh/r2mo-spec.git';
/** 本地缓存目录：.r2mo/repo/{仓库名}，与仓库名一致 */
const LOCAL_CACHE_DIR = `.r2mo/repo/${REPO_SPEC_NAME}`;
/** .gitignore 中写入的条目（共享目录根） */
const GITIGNORE_ENTRY = '.r2mo/repo';

module.exports = {
    REPO_SPEC_NAME,
    SPEC_REPO_URL,
    LOCAL_CACHE_DIR,
    GITIGNORE_ENTRY
};
