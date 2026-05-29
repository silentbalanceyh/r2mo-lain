@echo off
set "PROMPT=%~1"
set "TEMP_FILE=%OBSIDIAN_GIT_CREDENTIALS_INPUT%"

if not "%PROMPT%"=="" echo %PROMPT%> "%TEMP_FILE%"

:wait_response
if not exist "%TEMP_FILE%" (
    echo Trigger file got removed: Abort 1>&2
    exit /b 1
)
if exist "%TEMP_FILE%.response" goto :got_response
ping -n 1 127.0.0.1 >nul
goto :wait_response

:got_response
set /p RESPONSE=<"%TEMP_FILE%.response"
echo %RESPONSE%

if exist "%TEMP_FILE%" del "%TEMP_FILE%"
if exist "%TEMP_FILE%.response" del "%TEMP_FILE%.response"
