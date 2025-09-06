<?php
header('Content-Type: application/json');
$ttl = 300;
header("Cache-Control: public, max-age={$ttl}, stale-while-revalidate={$ttl}");
require_once __DIR__ . '/../cacheUtils.php';
require_once __DIR__ . '/../config/endpoints.php';
require_once __DIR__ . '/../httpUtils.php';

$itemId = isset($_GET['itemId']) ? intval($_GET['itemId']) : 0;
if (!$itemId) {
    http_response_code(400);
    echo json_encode(['error' => 'itemId required']);
    exit;
}

if (isset($_GET['invalidate'])) {
    CacheUtils::invalidate("item_{$itemId}");
    CacheUtils::invalidate("recipe_search_{$itemId}");
    CacheUtils::invalidate("recipe_{$itemId}");
    CacheUtils::invalidate("market_{$itemId}");
    CacheUtils::invalidate("nested_recipe_{$itemId}");
}

function fetch_json($url, &$statusCode = null, $key = null, $ttl = 3600) {
    $cacheKey = $key ?? md5($url);
    $cached = CacheUtils::get($cacheKey);
    $headers = [];
    if ($cached && isset($cached['meta'])) {
        if (isset($cached['meta']['etag'])) $headers[] = 'If-None-Match: ' . $cached['meta']['etag'];
        if (isset($cached['meta']['last_modified'])) $headers[] = 'If-Modified-Since: ' . $cached['meta']['last_modified'];
    }
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HEADER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    if ($headers) curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    $response = curl_exec($ch);
    $statusCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    $headerStr = substr($response, 0, $headerSize);
    $body = substr($response, $headerSize);
    curl_close($ch);
    if ($statusCode === 304 && $cached) {
        CacheUtils::set($cacheKey, $cached['data'], $ttl, $cached['meta']);
        $body = $cached['data'];
        $statusCode = 200;
    } elseif ($statusCode === 200) {
        $etag = null; $lastMod = null;
        foreach (explode("\r\n", $headerStr) as $line) {
            if (stripos($line, 'ETag:') === 0) $etag = trim(substr($line, 5));
            if (stripos($line, 'Last-Modified:') === 0) $lastMod = trim(substr($line, 14));
        }
        CacheUtils::set($cacheKey, $body, $ttl, ['etag' => $etag, 'last_modified' => $lastMod]);
    } else {
        return null;
    }
    $json = json_decode($body, true);
    if ($json === null && json_last_error() !== JSON_ERROR_NONE) {
        return null;
    }
    return $json;
}

$requests = [
    'item' => [
        'url' => ITEMS_ENDPOINT . "/{$itemId}?lang=" . LANG,
        'cacheKey' => "item_{$itemId}",
        'ttl' => 3600
    ],
    'recipe_search' => [
        'url' => RECIPES_SEARCH_ENDPOINT . "?output={$itemId}",
        'cacheKey' => "recipe_search_{$itemId}",
        'ttl' => 3600
    ],
    'market' => [
        'url' => MARKET_CSV_URL . "?fields=id,buy_price,sell_price,buy_quantity,sell_quantity,last_updated,1d_buy_sold,1d_sell_sold,2d_buy_sold,2d_sell_sold,7d_buy_sold,7d_sell_sold,1m_buy_sold,1m_sell_sold&ids={$itemId}",
        'cacheKey' => "market_{$itemId}",
        'ttl' => 300
    ]
];

$responses = multi_fetch($requests);

$item = null;
$itemStatus = $responses['item']['status'];
if ($itemStatus === 200 && $responses['item']['data']) {
    $item = json_decode($responses['item']['data'], true);
}
if (!$item) {
    if ($itemStatus === 404) {
        http_response_code(404);
        echo json_encode(['error' => 'Item not found']);
    } else {
        http_response_code(502);
        echo json_encode(['error' => 'Failed to fetch item data']);
    }
    exit;
}

$recipe = null;
if ($responses['recipe_search']['status'] === 200 && $responses['recipe_search']['data']) {
    $ids = json_decode($responses['recipe_search']['data'], true);
    if ($ids && count($ids) > 0) {
        $recipeId = $ids[0];
        $recipeData = fetch_json(RECIPES_ENDPOINT . "/{$recipeId}?lang=" . LANG, $tmp, "recipe_{$itemId}");
        if ($recipeData) {
            $ingredients = [];
            if (isset($recipeData['ingredients'])) {
                foreach ($recipeData['ingredients'] as $ing) {
                    $ingredients[] = [
                        'item_id' => $ing['item_id'],
                        'count' => $ing['count']
                    ];
                }
            }
            $recipe = [
                'output_item_count' => $recipeData['output_item_count'] ?? 1,
                'ingredients' => $ingredients
            ];
        }
    }
}

$market = [];
if ($responses['market']['status'] === 200 && $responses['market']['data']) {
    $market = parse_market_csv($responses['market']['data']);
}

$nestedStatus = null;
$nested = fetch_json(RECIPE_TREE_ENDPOINT . "/{$itemId}", $nestedStatus, "nested_recipe_{$itemId}", 86400);

$output = json_encode([
    'item' => $item,
    'recipe' => $recipe,
    'market' => $market,
    'nested_recipe' => $nested
]);
$etag = '"' . md5($output) . '"';
$lastMod = gmdate('D, d M Y H:i:s', time()) . ' GMT';
header("ETag: $etag");
header("Last-Modified: $lastMod");
if ((isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim($_SERVER['HTTP_IF_NONE_MATCH']) === $etag) ||
    (isset($_SERVER['HTTP_IF_MODIFIED_SINCE']) && strtotime($_SERVER['HTTP_IF_MODIFIED_SINCE']) >= strtotime($lastMod))) {
    http_response_code(304);
    exit;
}
echo $output;
?>
