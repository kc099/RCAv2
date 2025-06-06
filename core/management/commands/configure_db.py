from django.core.management.base import BaseCommand, CommandError
from core.db_handlers import configure_db_settings, get_db_config


class Command(BaseCommand):
    help = 'Configure database connection pooling and timeout settings'

    def add_arguments(self, parser):
        parser.add_argument(
            '--query-timeout',
            type=int,
            help='Query timeout in seconds (default: 30)',
        )
        parser.add_argument(
            '--connection-timeout',
            type=int,
            help='Connection timeout in seconds (default: 10)',
        )
        parser.add_argument(
            '--pool-min-size',
            type=int,
            help='Minimum number of connections in pool (default: 1)',
        )
        parser.add_argument(
            '--pool-max-size',
            type=int,
            help='Maximum number of connections in pool (default: 10)',
        )
        parser.add_argument(
            '--pool-recycle',
            type=int,
            help='Pool recycle time in seconds (default: 3600)',
        )
        parser.add_argument(
            '--max-execution-time',
            type=int,
            help='MySQL max execution time in seconds (default: 30)',
        )
        parser.add_argument(
            '--show-config',
            action='store_true',
            help='Show current configuration',
        )
        parser.add_argument(
            '--reset',
            action='store_true',
            help='Reset to default configuration',
        )

    def handle(self, *args, **options):
        if options['show_config']:
            self.show_current_config()
            return

        if options['reset']:
            self.reset_config()
            return

        # Collect configuration updates
        updates = {}
        
        if options['query_timeout'] is not None:
            updates['query_timeout'] = options['query_timeout']
            
        if options['connection_timeout'] is not None:
            updates['connection_timeout'] = options['connection_timeout']
            
        if options['pool_min_size'] is not None:
            updates['pool_minsize'] = options['pool_min_size']
            
        if options['pool_max_size'] is not None:
            updates['pool_maxsize'] = options['pool_max_size']
            
        if options['pool_recycle'] is not None:
            updates['pool_recycle'] = options['pool_recycle']
            
        if options['max_execution_time'] is not None:
            updates['max_execution_time'] = options['max_execution_time']

        if not updates:
            self.stdout.write(
                self.style.WARNING('No configuration options provided. Use --show-config to see current settings.')
            )
            return

        # Validate values
        for key, value in updates.items():
            if value < 0:
                raise CommandError(f'Invalid value for {key}: {value}. Must be non-negative.')
            
            if key in ['pool_minsize', 'pool_maxsize'] and value == 0:
                raise CommandError(f'Invalid value for {key}: {value}. Pool size must be at least 1.')

        # Apply updates
        configure_db_settings(**updates)
        
        self.stdout.write(
            self.style.SUCCESS('Database configuration updated successfully!')
        )
        
        # Show updated configuration
        self.show_current_config()

    def show_current_config(self):
        config = get_db_config()
        
        self.stdout.write(self.style.SUCCESS('\nCurrent Database Configuration:'))
        self.stdout.write(f"  Query Timeout: {config['query_timeout']} seconds")
        self.stdout.write(f"  Connection Timeout: {config['connection_timeout']} seconds")
        self.stdout.write(f"  Pool Min Size: {config['pool_minsize']} connections")
        self.stdout.write(f"  Pool Max Size: {config['pool_maxsize']} connections")
        self.stdout.write(f"  Pool Recycle: {config['pool_recycle']} seconds")
        self.stdout.write(f"  Max Execution Time: {config['max_execution_time']} seconds")
        
        # Performance recommendations
        self.stdout.write(self.style.WARNING('\nPerformance Tips:'))
        self.stdout.write("  • For high concurrency: increase pool-max-size")
        self.stdout.write("  • For long-running queries: increase query-timeout")
        self.stdout.write("  • For unstable networks: increase connection-timeout")
        self.stdout.write("  • For memory optimization: decrease pool-max-size")

    def reset_config(self):
        default_config = {
            'query_timeout': 30,
            'connection_timeout': 10,
            'pool_minsize': 1,
            'pool_maxsize': 10,
            'pool_recycle': 3600,
            'max_execution_time': 30,
        }
        
        configure_db_settings(**default_config)
        
        self.stdout.write(
            self.style.SUCCESS('Database configuration reset to defaults!')
        )
        
        self.show_current_config() 