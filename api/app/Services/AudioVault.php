<?php

namespace App\Services;

use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

/**
 * Encrypted audio at rest. Each object is "VNA1" + 12-byte nonce + 16-byte GCM tag + AES-256-GCM ciphertext.
 *
 * The whole file is encrypted in one call: uploads are capped at 25 MB, and raw GCM output only needs about
 * twice the file size in memory, where Laravel's Crypt would base64 the data twice (about 4x, past PHP's
 * default 128 MB limit). The storage key is bound in as associated data, so a blob copied onto another
 * note's key fails to decrypt instead of playing someone else's audio.
 *
 * The data key is derived from APP_KEY, so rotating APP_KEY makes existing audio unreadable.
 */
class AudioVault
{
    private const MAGIC = 'VNA1';

    private const CIPHER = 'aes-256-gcm';

    public function put(string $key, string $contents): void
    {
        $nonce = random_bytes(12);
        $tag = '';
        $ciphertext = openssl_encrypt($contents, self::CIPHER, $this->dataKey(), OPENSSL_RAW_DATA, $nonce, $tag, $key, 16);
        if ($ciphertext === false) {
            throw new RuntimeException('Audio could not be encrypted.');
        }

        $this->disk()->put($key, self::MAGIC.$nonce.$tag.$ciphertext);
    }

    public function get(string $key): string
    {
        $blob = $this->disk()->get($key);
        if (! is_string($blob) || strlen($blob) < 32 || ! str_starts_with($blob, self::MAGIC)) {
            throw new RuntimeException('Stored audio is missing or unreadable.');
        }

        $plain = openssl_decrypt(substr($blob, 32), self::CIPHER, $this->dataKey(), OPENSSL_RAW_DATA, substr($blob, 4, 12), substr($blob, 16, 16), $key);
        if ($plain === false) {
            throw new RuntimeException('Stored audio failed its integrity check.');
        }

        return $plain;
    }

    public function delete(string $key): void
    {
        $this->disk()->delete($key);
    }

    private function disk(): Filesystem
    {
        return Storage::disk('audio');
    }

    private function dataKey(): string
    {
        $appKey = (string) config('app.key');
        if (str_starts_with($appKey, 'base64:')) {
            $appKey = base64_decode(substr($appKey, 7));
        }
        if ($appKey === '') {
            throw new RuntimeException('APP_KEY is not set.');
        }

        return hash_hkdf('sha256', $appKey, 32, 'voice-note-audio-v1');
    }
}
