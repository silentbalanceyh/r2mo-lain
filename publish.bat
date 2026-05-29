@echo off

if "%~1"=="" (
    echo [31mError: Please provide a git commit message.[0m
    echo Usage: publish.bat "Your commit message"
    exit /b 1
)

echo [36m1. Bumping version (npm version patch)...[0m
call npm version patch --no-git-tag-version

echo [36m2. Publishing to NPM (npm publish)...[0m
call npm publish --registry=https://registry.npmjs.org/

echo [36m3. Committing and pushing (Git)...[0m
git add .
git commit -m "%~1"
git push

echo [32mPublish complete![0m
