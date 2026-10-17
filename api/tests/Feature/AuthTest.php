<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    private function registration(array $overrides = []): array
    {
        return array_merge([
            'organization' => 'Acme Field Sales',
            'name' => 'Pat Manager',
            'email' => 'pat@example.com',
            'password' => 'correct-horse-battery',
            'age_confirmed' => true,
            'terms_accepted' => true,
        ], $overrides);
    }

    public function test_health_check_reports_ok(): void
    {
        $this->getJson('/api/health')->assertOk()->assertExactJson(['status' => 'ok']);
    }

    public function test_register_creates_an_organization_with_the_user_as_manager(): void
    {
        $res = $this->postJson('/api/auth/register', $this->registration(['email' => 'Pat@Example.com']))
            ->assertCreated()
            ->assertJsonPath('user.role', 'manager')
            ->assertJsonPath('user.email', 'pat@example.com')
            ->assertJsonPath('user.organization.name', 'Acme Field Sales')
            ->assertJsonPath('user.organization.is_demo', false)
            ->assertJsonMissingPath('user.id')
            ->assertJsonMissingPath('user.password');

        $user = User::firstWhere('email', 'pat@example.com');
        $this->assertNotNull($user->terms_accepted_at);
        $this->assertTrue($user->organization->settings()->exists());
        $this->assertNull($user->organization->settings->system_prompt);

        $this->withToken($res->json('token'))->getJson('/api/me')->assertOk()->assertJsonPath('user.name', 'Pat Manager');
    }

    public function test_register_requires_age_confirmation_and_terms(): void
    {
        $this->postJson('/api/auth/register', $this->registration(['age_confirmed' => false, 'terms_accepted' => null]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['age_confirmed', 'terms_accepted']);

        $this->assertSame(0, Organization::count());
    }

    public function test_register_validates_fields(): void
    {
        $this->postJson('/api/auth/register', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['organization', 'name', 'email', 'password', 'age_confirmed', 'terms_accepted']);

        $this->postJson('/api/auth/register', $this->registration(['email' => 'not-an-email', 'password' => 'short']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['email', 'password']);
    }

    public function test_register_rejects_a_taken_email_with_a_generic_message(): void
    {
        User::factory()->create(['email' => 'pat@example.com']);

        $this->postJson('/api/auth/register', $this->registration())
            ->assertUnprocessable()
            ->assertJsonPath('errors.email.0', "We couldn't create an account with this email.");
    }

    public function test_login_returns_a_token(): void
    {
        User::factory()->create(['email' => 'rep@example.com', 'password' => 'secret-pass-1']);

        $token = $this->postJson('/api/auth/login', ['email' => 'REP@example.com', 'password' => 'secret-pass-1'])
            ->assertOk()
            ->assertJsonPath('user.role', 'rep')
            ->json('token');

        $this->withToken($token)->getJson('/api/me')->assertOk()->assertJsonPath('user.email', 'rep@example.com');
    }

    public function test_login_failures_share_one_generic_message(): void
    {
        User::factory()->create(['email' => 'rep@example.com', 'password' => 'secret-pass-1']);
        User::factory()->deactivated()->create(['email' => 'gone@example.com', 'password' => 'secret-pass-1']);

        $messages = collect([
            ['email' => 'rep@example.com', 'password' => 'wrong-password'],
            ['email' => 'nobody@example.com', 'password' => 'secret-pass-1'],
            ['email' => 'gone@example.com', 'password' => 'secret-pass-1'],
        ])->map(fn ($creds) => $this->postJson('/api/auth/login', $creds)->assertUnprocessable()->json('errors.email.0'));

        $this->assertCount(1, $messages->unique());
    }

    public function test_me_requires_authentication(): void
    {
        $this->getJson('/api/me')->assertUnauthorized()->assertJsonStructure(['message']);
        $this->withToken('1|not-a-real-token')->getJson('/api/me')->assertUnauthorized();
    }

    public function test_logout_revokes_the_token(): void
    {
        $token = User::factory()->create()->createToken('spa')->plainTextToken;

        $this->withToken($token)->postJson('/api/auth/logout')->assertNoContent();
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/me')->assertUnauthorized();
    }

    public function test_expired_token_is_rejected(): void
    {
        $token = User::factory()->create()->createToken('spa', ['*'], now()->subMinute())->plainTextToken;

        $this->withToken($token)->getJson('/api/me')->assertUnauthorized();
    }

    public function test_issued_tokens_expire(): void
    {
        User::factory()->create(['email' => 'rep@example.com', 'password' => 'secret-pass-1']);
        $this->postJson('/api/auth/login', ['email' => 'rep@example.com', 'password' => 'secret-pass-1'])->assertOk();

        $this->assertNotNull(User::firstWhere('email', 'rep@example.com')->tokens()->first()->expires_at);
    }

    public function test_demo_login_signs_into_the_labelled_demo_organization(): void
    {
        $this->seed(DemoSeeder::class);

        $this->postJson('/api/demo/login', ['role' => 'manager'])
            ->assertOk()
            ->assertJsonPath('user.role', 'manager')
            ->assertJsonPath('user.organization.name', DemoSeeder::ORG_NAME)
            ->assertJsonPath('user.organization.is_demo', true);

        $token = $this->postJson('/api/demo/login', ['role' => 'rep'])->assertOk()->assertJsonPath('user.role', 'rep')->json('token');
        $this->withToken($token)->getJson('/api/clients')->assertOk()->assertJsonCount(6, 'data');
    }

    public function test_demo_login_validates_the_role(): void
    {
        $this->seed(DemoSeeder::class);

        $this->postJson('/api/demo/login', ['role' => 'admin'])->assertUnprocessable()->assertJsonValidationErrors('role');
    }

    public function test_demo_login_is_unavailable_without_a_demo_organization_or_when_disabled(): void
    {
        $this->postJson('/api/demo/login', ['role' => 'rep'])->assertNotFound();

        $this->seed(DemoSeeder::class);
        config(['services.demo.login_enabled' => false]);
        $this->postJson('/api/demo/login', ['role' => 'rep'])->assertNotFound();
    }

    public function test_demo_seeder_is_idempotent(): void
    {
        $this->seed(DemoSeeder::class);
        $this->seed(DemoSeeder::class);

        $org = Organization::where('is_demo', true)->sole();
        $this->assertSame(2, $org->users()->count());
        $this->assertSame(6, $org->clients()->count());
    }
}
