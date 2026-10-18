#!/bin/sh
# Runs migrations, then the HTTP server and a queue worker in one container.
# Demo pruning is triggered hourly through POST /api/cron/run (see README).
set -e

mkdir -p storage/framework/cache storage/framework/views storage/logs storage/app/private/audio

php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan migrate --force
php artisan db:enable-rls

# The demo seeder only creates what is missing, so it is safe on every start.
if [ "${DEMO_LOGIN_ENABLED:-true}" = "true" ]; then
    php artisan db:seed --class=DemoSeeder --force
fi

(while true; do php artisan queue:work --tries=3 --sleep=3 --max-time=3600 || true; sleep 2; done) &

exec frankenphp php-server --root public --listen ":${PORT:-8080}"
