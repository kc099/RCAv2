from django.core.management.base import BaseCommand
from django.contrib.sites.models import Site
import socket

class Command(BaseCommand):
    help = 'Updates the Site domain for proper OAuth redirect URIs'

    def add_arguments(self, parser):
        parser.add_argument('--domain', type=str, help='Domain to set (e.g., example.com)')
        parser.add_argument('--use-localhost', action='store_true', help='Use localhost:8000 for development')

    def handle(self, *args, **options):
        site = Site.objects.get(id=1)
        old_domain = site.domain
        
        if options['domain']:
            new_domain = options['domain']
        elif options['use_localhost']:
            new_domain = 'localhost:8000'
        else:
            # Try to determine the hostname
            try:
                hostname = socket.gethostname()
                local_ip = socket.gethostbyname(hostname)
                new_domain = f"{local_ip}:8000"
            except:
                new_domain = 'localhost:8000'
        
        site.domain = new_domain
        site.name = 'ORCA'
        site.save()
        
        self.stdout.write(self.style.SUCCESS(f'Successfully updated site domain from "{old_domain}" to "{new_domain}"'))
        
        # Output redirect URI
        self.stdout.write('\nGoogle OAuth Redirect URI:')
        self.stdout.write(self.style.WARNING(f'http://{new_domain}/accounts/google/login/callback/'))
        self.stdout.write(self.style.WARNING(f'https://{new_domain}/accounts/google/login/callback/'))
        
        self.stdout.write('\nMake sure to add these URIs to your Google Cloud Console OAuth settings')
        self.stdout.write('For development, use the http:// version. For production, use the https:// version.')
