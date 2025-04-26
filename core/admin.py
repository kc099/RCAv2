from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils.translation import gettext_lazy as _

from core import models


class UserAdmin(BaseUserAdmin):
    """define the admin pages for users"""
    ordering = ['id']
    list_display = ['email', 'name']
    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        (
            _('Permissions'),
            {
                'fields': (
                    'is_active',
                    'is_staff',
                    'is_superuser',
                )
            }
        ),
        (_('Important dates'), {'fields': ('last_login',)})
    )
    readonly_fields = ['last_login']
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': (
                'email',
                'password1',
                'password2',
                'name',
                'is_active',
                'is_staff',
                'is_superuser',
            )
        }),
    )


class AdminUserAdmin(admin.ModelAdmin):
    """Admin for AdminUser model"""
    list_display = ['user', 'department', 'is_global_admin', 'access_level']
    list_filter = ['is_global_admin', 'department']
    search_fields = ['user__email', 'user__name', 'department']


class NormalUserAdmin(admin.ModelAdmin):
    """Admin for NormalUser model"""
    list_display = ['user', 'phone_number', 'role']
    search_fields = ['user__email', 'user__name', 'role']


admin.site.register(models.User, UserAdmin)
admin.site.register(models.AdminUser, AdminUserAdmin)
admin.site.register(models.NormalUser, NormalUserAdmin)
