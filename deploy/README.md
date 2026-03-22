# Deploy scaffolding

This directory holds the deployment templates and helpers for composing the KVideo services locally.

1. Populate `deploy/env.example` (and any other `.example` files) with production values to generate working `.env` files.
2. Run `deploy/scripts/prepare-env.sh` to copy the templates into place and create any required cache directories.
3. Keep the generated files in `.gitignore`; only commit the tracked templates and helper script.
