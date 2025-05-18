#!/bin/bash
# Script to update Google OAuth integration

# Activate conda environment (this line won't do anything if run directly)
# You need to activate your environment manually before running this script:
# conda activate rca-env

# Make migrations for the new username field explicitly for core app
echo "Making migrations for username field..."
python manage.py makemigrations core --name "add_username_field"

# Apply migrations
echo "Applying migrations..."
python manage.py migrate

# Update site domain
echo "Updating site domain for OAuth redirect..."
python manage.py shell -c "from django.contrib.sites.models import Site; site = Site.objects.get(id=1); print(f'Current site domain: {site.domain}'); site.domain = '127.0.0.1:8000'; site.save(); print(f'Updated site domain to: {site.domain}')"

# Display OAuth redirect URI
echo -e "\n==== GOOGLE OAUTH CONFIGURATION ====\n"
echo "Authorized redirect URI:"
echo "http://127.0.0.1:8000/accounts/google/login/callback/"
echo -e "\nMake sure this exact URI is added in your Google Cloud Console.\n"
