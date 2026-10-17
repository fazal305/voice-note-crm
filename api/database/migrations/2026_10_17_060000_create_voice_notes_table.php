<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('voice_notes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('org_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('client_id')->nullable()->constrained('clients')->nullOnDelete();
            $table->string('status', 20);
            $table->string('source', 20);
            $table->string('storage_key')->unique();
            $table->string('mime', 50);
            $table->unsignedBigInteger('size_bytes');
            $table->unsignedInteger('duration_seconds')->nullable();
            $table->string('original_name')->nullable();
            $table->text('error')->nullable();
            $table->timestamps();

            $table->index(['org_id', 'created_at']);
            $table->index(['user_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('voice_notes');
    }
};
