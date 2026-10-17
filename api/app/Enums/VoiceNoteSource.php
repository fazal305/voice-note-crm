<?php

namespace App\Enums;

enum VoiceNoteSource: string
{
    case Recording = 'recording';
    case Upload = 'upload';
}
