<?php
header('Content-Type: application/json');
$ttl = 300;
header("Cache-Control: public, max-age={$ttl}, stale-while-revalidate={$ttl}");
require_once __DIR__ . '/../cacheUtils.php';
require_once __DIR__ . '/../config/endpoints.php';

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
        CacheUtils::invalidate("nested_recipe_{$iid}");
    }
}

function multi_fetch($requests) {
    $multi = curl_multi_init();
    $handles = [];
    $responses = [];

    foreach ($requests as $key => $req) {
        $cache = CacheUtils::get($req['cacheKey']);
        if ($cache) {
            $responses[$key] = ['status' => 200, 'data' => $cache['data']];
            continue;
        }
        $ch = curl_init($req['url']);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HEADER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        if ($cache && isset($cache['meta'])) {
            $headers = [];
            if (isset($cache['meta']['etag'])) $headers[] = 'If-None-Match: ' . $cache['meta']['etag'];
            if (isset($cache['meta']['last_modified'])) $headers[] = 'If-Modified-Since: ' . $cache['meta']['last_modified'];
            if ($headers) curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        }
        curl_multi_add_handle($multi, $ch);
        $handles[$key] = ['handle' => $ch, 'cacheKey' => $req['cacheKey'], 'ttl' => $req['ttl']];
    }

    do {
        $status = curl_multi_exec($multi, $active);
        if ($active) curl_multi_select($multi);
    } while ($active && $status == CURLM_OK);

    foreach ($handles as $key => $info) {
        $ch = $info['handle'];
        $content = curl_multi_getcontent($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        $headersStr = substr($content, 0, $headerSize);
        $body = substr($content, $headerSize);

        if ($code === 200) {
            $etag = null; $lastMod = null;
            foreach (explode("\r\n", $headersStr) as $line) {
                if (stripos($line, 'ETag:') === 0) $etag = trim(substr($line, 5));
                if (stripos($line, 'Last-Modified:') === 0) $lastMod = trim(substr($line, 14));
            }
            CacheUtils::set($info['cacheKey'], $body, $info['ttl'], ['etag' => $etag, 'last_modified' => $lastMod]);
        } elseif ($code === 304) {
            $cached = CacheUtils::get($info['cacheKey']);
            if ($cached) {
                CacheUtils::set($info['cacheKey'], $cached['data'], $info['ttl'], $cached['meta']);
                $body = $cached['data'];
                $code = 200;
            } else {
                $body = null;
            }
        } else {
            $body = null;
        }

        $responses[$key] = ['status' => $code, 'data' => $body];
        curl_multi_remove_handle($multi, $ch);
        curl_close($ch);
    }

    curl_multi_close($multi);
    return $responses;
}

function parse_market_bundle_csv($csv) {
    if ($csv === null) return [];
    $lines = array_map('trim', explode("\n", $csv));
    if (count($lines) < 2) return [];
    $headers = str_getcsv($lines[0]);
    $results = [];
    for ($i = 1; $i < count($lines); $i++) {
        if ($lines[$i] === '') continue;
        $values = str_getcsv($lines[$i]);
        $row = [];
        foreach ($headers as $j => $h) {
            $value = $values[$j] ?? null;
            if (is_numeric($value)) {
                $value = strpos($value, '.') !== false ? (float)$value : (int)$value;
            }
            $row[$h] = $value;
        }
        if (isset($row['id'])) {
            $results[(int)$row['id']] = $row;
        }
    }
    return $results;
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
        'output_item_count' => $recipe['output_item_count'] ?? 1,
        'ingredients' => $ingredients
    ];
}

function fetch_nested_recipe($id) {
    $cacheKey = "nested_recipe_{$id}";
    $cache = CacheUtils::get($cacheKey);
    if ($cache && isset($cache['data'])) {
        $json = json_decode($cache['data'], true);
        if ($json !== null) {
            return $json;
        }
    }
    $ch = curl_init(RECIPE_TREE_ENDPOINT . "/{$id}");
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code === 200 && $body !== false) {
        CacheUtils::set($cacheKey, $body, 86400);
        $json = json_decode($body, true);
        if ($json !== null) {
            return $json;
        }
    }
    return null;
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
        'nested_recipe' => fetch_nested_recipe($id)
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
