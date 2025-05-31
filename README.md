# ORCA Django Project

This is a Django-based web application with social authentication (Google), custom user model, and agent integration.

## Features
- Django 5.x
- Social authentication via Google (django-allauth)
- Custom user model
- Agent integration (MCP Agent)
- Environment-based configuration

## Prerequisites
- Python 3.10+
- pip (Python package manager)

## Setup Instructions

### 1. Clone the repository
```bash
git clone <your-repo-url>
cd ORCA
```

### 2. Create and activate a virtual environment
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows use: venv\Scripts\activate
```

### 3. Install dependencies
```bash
pip install -r requirements.txt
```

### 4. Set up environment variables
Create a `.env` file in the project root with the following variables:

```ini
SECRET_KEY=your-django-secret-key
DEBUG=True  # or False for production
DB_ENGINE=django.db.backends.mysql  # or your preferred backend
DB_NAME=your_db_name
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_HOST=localhost
DB_PORT=3306
DB_CHARSET=utf8mb4
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
ANTHROPIC_API_KEY=your-anthropic-api-key  # if using agent features
```

- Adjust values as needed for your environment.
- For Google authentication, set up OAuth credentials in the Google Developer Console.

### 5. Apply database migrations
```bash
python manage.py migrate
```

### 6. Create a superuser (admin account)
```bash
python manage.py createsuperuser
```

### 7. Run the development server
```bash
python manage.py runserver
```

Visit [http://127.0.0.1:8000/](http://127.0.0.1:8000/) in your browser.

## Additional Notes
- Static files are served from `/static/` during development.
- For production, configure `ALLOWED_HOSTS`, `DEBUG`, and static/media file serving appropriately.
- See `rca/settings.py` for all configurable options.

## License
Specify your license here. 