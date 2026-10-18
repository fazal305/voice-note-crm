<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A uuid the browser picks once per recording, so a retried upload whose first attempt did reach the server
     * returns that note instead of creating a second one. Unique per user; NULLs (older clients) never collide.
     */
    public function up(): void
    {
        Schema::table('voice_notes', function (Blueprint $table) {
            $table->uuid('client_upload_id')->nullable();
            $table->unique(['user_id', 'client_upload_id']);
        });
    }

    public function down(): void
    {
        Schema::table('voice_notes', function (Blueprint $table) {
            $table->dropUnique(['user_id', 'client_upload_id']);
            $table->dropColumn('client_upload_id');
        });
    }
};
