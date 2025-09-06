<?php
header('Content-Type: application/json');
$ttl = 300;
header("Cache-Control: public, max-age={$ttl}, stale-while-revalidate={$ttl}");
require_once __DIR__ . '/../cacheUtils.php';
require_once __DIR__ . '/../config/endpoints.php';
require_once __DIR__ . '/../httpUtils.php';

$ids = isset($_GET['ids']) ? $_GET['ids'] : [];
if (!is_array($ids)) {
    $ids = explode(',', $ids);
}
$ids = array_values(array_filter(array_map('intval', $ids)));
if (count($ids) === 0) {
    http_response_code(400);
    echo json_encode(['error' => 'ids required']);
    exit;
}

if (isset($_GET['invalidate'])) {
    $inv = $_GET['invalidate'];
    if (!is_array($inv)) {
        $inv = explode(',', $inv);
    }
    foreach ($inv as $iid) {
        $iid = intval($iid);
        CacheUtils::invalidate("items_{$iid}");
        CacheUtils::invalidate("recipe_search_{$iid}");
        CacheUtils::invalidate("recipe_{$iid}");
        CacheUtils::invalidate("market_{$iid}");
    }
}

function recipe_min_from_data($recipe) {
    if (!$recipe) return null;
    $ingredients = [];
    if (isset($recipe['ingredients']) && is_array($recipe['ingredients'])) {
        foreach ($recipe['ingredients'] as $ing) {
            $ingredients[] = [
                'item_id' => $ing['item_id'],
                'count' => $ing['count']
            ];
        }
    }
    return [
        'id' => $recipe['id'] ?? null,
        'output_item_count' => $recipe['output_item_count'] ?? 1,
        'ingredients' => $ingredients
    ];
}

$idStr = implode(',', $ids);

$requests = [
    'items' => [
        'url' => ITEMS_ENDPOINT . "?ids={$idStr}&lang=" . LANG,
        'cacheKey' => "items_{$idStr}",
        'ttl' => 3600
    ],
    'market' => [
        'url' => MARKET_CSV_URL . "?fields=id,buy_price,sell_price&ids={$idStr}",
        'cacheKey' => "market_{$idStr}",
        'ttl' => 300
    ]
];

foreach ($ids as $id) {
    $requests["recipe_search_{$id}"] = [
        'url' => RECIPES_SEARCH_ENDPOINT . "?output={$id}",
        'cacheKey' => "recipe_search_{$id}",
        'ttl' => 3600
    ];
}

$responses = multi_fetch($requests);

$items = [];
if ($responses['items']['status'] === 200 && $responses['items']['data']) {
    $items = json_decode($responses['items']['data'], true);
}
if (!is_array($items)) {
    http_response_code(502);
    echo json_encode(['error' => 'Failed to fetch item data']);
    exit;
}

$itemMap = [];
foreach ($items as $item) {
    $itemMap[$item['id']] = [
        'id' => $item['id'],
        'name' => $item['name'] ?? null,
        'icon' => $item['icon'] ?? null,
        'rarity' => $item['rarity'] ?? null
    ];
}

$marketMap = [];
if ($responses['market']['status'] === 200 && $responses['market']['data']) {
    $marketMap = parse_market_bundle_csv($responses['market']['data']);
}

$recipeIds = [];
foreach ($ids as $id) {
    $key = "recipe_search_{$id}";
    if (isset($responses[$key]) && $responses[$key]['status'] === 200 && $responses[$key]['data']) {
        $idsList = json_decode($responses[$key]['data'], true);
        if ($idsList && count($idsList) > 0) {
            $recipeIds[$id] = $idsList[0];
        }
    }
}

$recipeReqs = [];
foreach ($recipeIds as $itemId => $recipeId) {
    $recipeReqs[$itemId] = [
        'url' => RECIPES_ENDPOINT . "/{$recipeId}?lang=" . LANG,
        'cacheKey' => "recipe_{$itemId}",
        'ttl' => 3600
    ];
}

$recipeResponses = multi_fetch($recipeReqs);
$recipeMap = [];
foreach ($recipeResponses as $itemId => $resp) {
    if ($resp['status'] === 200 && $resp['data']) {
        $recipeData = json_decode($resp['data'], true);
        $recipeMap[$itemId] = recipe_min_from_data($recipeData);
    }
}

$result = [];
foreach ($ids as $id) {
    if (!isset($itemMap[$id])) continue;
    $result[] = [
        'id' => $id,
        'item' => $itemMap[$id],
        'recipe' => $recipeMap[$id] ?? null,
        'market' => $marketMap[$id] ?? [],
        'extra' => [
            'last_updated' => time()
        ]
    ];
}

$output = json_encode($result);
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
