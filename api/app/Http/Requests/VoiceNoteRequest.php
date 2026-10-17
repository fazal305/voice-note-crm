<?php

namespace App\Http\Requests;

use Closure;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Validation\Rule;

class VoiceNoteRequest extends FormRequest
{
    public const MAX_KILOBYTES = 25 * 1024;

    /**
     * Extensions accepted per source, and the types finfo may report for each file's actual contents.
     * Browsers record to WebM/Opus (Chrome, Firefox), Ogg/Opus (Firefox) or MP4/AAC (Safari); finfo reports
     * those containers as video/* because it can't tell an audio-only stream apart.
     */
    private const SNIFFED_TYPES = [
        'mp3' => ['audio/mpeg', 'audio/mp3', 'audio/x-mpeg'],
        'wav' => ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave'],
        'm4a' => ['audio/mp4', 'audio/x-m4a', 'audio/m4a', 'video/mp4'],
        'webm' => ['audio/webm', 'video/webm'],
        'ogg' => ['audio/ogg', 'application/ogg', 'video/ogg'],
        'mp4' => ['audio/mp4', 'audio/x-m4a', 'video/mp4'],
    ];

    private const UPLOAD_EXTENSIONS = ['mp3', 'wav', 'm4a'];

    private const RECORDING_EXTENSIONS = ['mp3', 'wav', 'm4a', 'webm', 'ogg', 'mp4'];

    /** The Content-Type the audio is served back with, by extension. */
    public const SERVED_TYPES = [
        'mp3' => 'audio/mpeg',
        'wav' => 'audio/wav',
        'm4a' => 'audio/mp4',
        'webm' => 'audio/webm',
        'ogg' => 'audio/ogg',
        'mp4' => 'audio/mp4',
    ];

    public function rules(): array
    {
        return [
            'source' => ['required', Rule::in(['recording', 'upload'])],
            'audio' => ['required', 'file', 'max:'.self::MAX_KILOBYTES, $this->audioContents(...)],
            'client_id' => ['nullable', 'integer', Rule::exists('clients', 'id')->where('org_id', $this->user()->org_id)],
            'duration_seconds' => ['nullable', 'integer', 'min:0', 'max:14400'],
        ];
    }

    public function messages(): array
    {
        return [
            'audio.required' => 'Choose an audio file or make a recording.',
            'audio.file' => 'The audio did not upload. Please try again.',
            'audio.uploaded' => 'The audio did not upload. It may be larger than 25 MB.',
            'audio.max' => 'That file is larger than 25 MB.',
            'client_id.exists' => 'Choose a client from your organization.',
            'source.in' => 'Unknown audio source.',
        ];
    }

    public function extension(): string
    {
        return strtolower($this->file('audio')->getClientOriginalExtension());
    }

    // Checks the extension against the source's allowlist, then the real file contents (not the type the
    // browser declared) against the types that extension may contain.
    private function audioContents(string $attribute, mixed $file, Closure $fail): void
    {
        if (! $file instanceof UploadedFile) {
            return;
        }

        $allowed = $this->input('source') === 'recording' ? self::RECORDING_EXTENSIONS : self::UPLOAD_EXTENSIONS;
        $extension = strtolower($file->getClientOriginalExtension());
        if (! in_array($extension, $allowed, true)) {
            $fail($this->input('source') === 'recording'
                ? 'That recording format is not supported.'
                : 'Upload an .mp3, .wav or .m4a file.');

            return;
        }

        $sniffed = (new \finfo(FILEINFO_MIME_TYPE))->file($file->getRealPath());
        if (! in_array($sniffed, self::SNIFFED_TYPES[$extension], true)) {
            $fail("That file isn't valid .{$extension} audio.");
        }
    }
}
