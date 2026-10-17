<?php

namespace App\Models;

use App\Enums\UserRole;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

#[Fillable(['name', 'email', 'password'])]
#[Hidden(['password'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    // org_id, role, terms_accepted_at and deactivated_at are set only by the app, never from request input.
    protected $attributes = ['role' => 'rep'];

    protected function casts(): array
    {
        return [
            'role' => UserRole::class,
            'password' => 'hashed',
            'terms_accepted_at' => 'datetime',
            'deactivated_at' => 'datetime',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'org_id');
    }

    public function isManager(): bool
    {
        return $this->role === UserRole::Manager;
    }

    public function isActive(): bool
    {
        return $this->deactivated_at === null;
    }

    public function toProfile(): array
    {
        return [
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->role->value,
            'organization' => [
                'name' => $this->organization->name,
                'is_demo' => $this->organization->is_demo,
            ],
        ];
    }
}
