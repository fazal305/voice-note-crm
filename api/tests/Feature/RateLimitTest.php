<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RateLimitTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_is_limited_per_ip(): void
    {
        for ($i = 0; $i < 10; $i++) {
            $this->postJson('/api/auth/login', ['email' => "user{$i}@example.com", 'password' => 'wrong-password'])->assertUnprocessable();
        }

        $this->postJson('/api/auth/login', ['email' => 'another@example.com', 'password' => 'wrong-password'])
            ->assertStatus(429)
            ->assertExactJson(['message' => 'Too many requests. Please wait a minute and try again.'])
            ->assertHeader('Retry-After');
    }

    public function test_login_is_limited_per_email_across_ips(): void
    {
        for ($i = 0; $i < 10; $i++) {
            $this->withServerVariables(['REMOTE_ADDR' => "203.0.113.{$i}"])
                ->postJson('/api/auth/login', ['email' => 'target@example.com', 'password' => 'wrong-password'])
                ->assertUnprocessable();
        }

        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.1'])
            ->postJson('/api/auth/login', ['email' => 'Target@Example.com', 'password' => 'wrong-password'])
            ->assertStatus(429);
    }

    public function test_demo_login_is_limited(): void
    {
        $this->seed(DemoSeeder::class);

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/demo/login', ['role' => 'rep'])->assertOk();
        }

        $this->postJson('/api/demo/login', ['role' => 'rep'])->assertStatus(429)->assertJsonStructure(['message']);
    }

    public function test_api_is_limited_per_user(): void
    {
        $this->asUser(User::factory()->create());

        for ($i = 0; $i < 120; $i++) {
            $this->getJson('/api/me')->assertOk();
        }

        $this->getJson('/api/me')->assertStatus(429)->assertJsonStructure(['message']);
    }
}
