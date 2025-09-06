<?php
require_once __DIR__.'/cache.php';
require_once __DIR__.'/redis_cache.php';

class CacheUtils {
    private static $useRedis = null;

    private static function useRedis(): bool {
        if (self::$useRedis === null) {
            self::$useRedis = RedisCacheClient::client() !== null;
        }
        return self::$useRedis;
    }

    public static function get(string $key): ?array {
        return self::useRedis() ? redis_get($key) : cache_get($key);
    }

    public static function set(string $key, $value, int $ttl = 3600, array $meta = []): void {
        if (self::useRedis()) {
            redis_set($key, $value, $ttl, $meta);
        } else {
            cache_set($key, $value, $ttl, $meta);
        }
    }

    public static function invalidate(string $pattern): void {
        if (self::useRedis()) {
            redis_invalidate($pattern);
        } else {
            cache_invalidate($pattern);
        }
    }
}
?>
