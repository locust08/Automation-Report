$ErrorActionPreference = "Stop"

# The saved ai-backend service token must not override the user's normal
# Doppler login when launching the main locus-t-ai-backend environment.
Remove-Item Env:DOPPLER_TOKEN -ErrorAction SilentlyContinue

doppler run --no-read-env --project locus-t-ai-backend --config dev -- npm run dev
exit $LASTEXITCODE
