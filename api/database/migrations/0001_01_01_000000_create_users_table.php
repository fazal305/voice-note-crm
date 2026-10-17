<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('organizations', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->boolean('is_demo')->default(false)->index();
            $table->timestamps();
        });

        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->foreignId('org_id')->constrained('organizations')->cascadeOnDelete();
            $table->enum('role', ['rep', 'manager'])->default('rep');
            $table->string('name');
            $table->string('email')->unique();
            $table->string('password');
            $table->timestamp('terms_accepted_at')->nullable();
            $table->timestamp('deactivated_at')->nullable();
            $table->timestamps();

            $table->index(['org_id', 'name']);
        });

        Schema::create('org_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('org_id')->unique()->constrained('organizations')->cascadeOnDelete();
            $table->text('system_prompt')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('org_settings');
        Schema::dropIfExists('users');
        Schema::dropIfExists('organizations');
    }
};
