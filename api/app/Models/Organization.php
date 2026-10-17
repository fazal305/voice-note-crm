<?php

namespace App\Models;

use Database\Factories\OrganizationFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

#[Fillable(['name'])]
class Organization extends Model
{
    /** @use HasFactory<OrganizationFactory> */
    use HasFactory;

    // is_demo is set only by the demo seeder, never from request input.
    protected $attributes = ['is_demo' => false];

    protected function casts(): array
    {
        return ['is_demo' => 'boolean'];
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class, 'org_id');
    }

    public function clients(): HasMany
    {
        return $this->hasMany(Client::class, 'org_id');
    }

    public function settings(): HasOne
    {
        return $this->hasOne(OrgSetting::class, 'org_id');
    }
}
