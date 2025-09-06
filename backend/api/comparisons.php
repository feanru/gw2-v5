<?php
require_once __DIR__.'/../session.php';
require_once __DIR__.'/../cacheUtils.php';
header('Content-Type: application/json');
header('Cache-Control: no-store, private');

$user = require_session();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $stmt = $pdo->prepare('SELECT id, item_left, item_right, item_names, item_ids FROM comparisons WHERE user_id=?');
    $stmt->execute([$user['id']]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as &$row) {
        if (!empty($row['item_ids'])) {
            $row['item_ids'] = json_decode($row['item_ids'], true);
        } else {
            $row['item_ids'] = array_filter([$row['item_left'], $row['item_right']]);
        }
    }
    echo json_encode($rows);
} elseif ($method === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $ids = $data['item_ids'] ?? null;
    $names = $data['item_names'] ?? null;
    if (!is_array($ids) || count($ids) < 2) {
        http_response_code(400);
        echo json_encode(['error' => 'item_ids array required (min 2)']);
        exit;
    }
    if (is_array($names)) {
        $names = json_encode($names);
    }
    $left = $ids[0];
    $right = $ids[1];
    $stmt = $pdo->prepare('INSERT INTO comparisons (user_id, item_left, item_right, item_names, item_ids) VALUES (?, ?, ?, ?, ?)');
    $stmt->execute([$user['id'], $left, $right, $names, json_encode($ids)]);
    CacheUtils::invalidate('user_comparisons_' . $user['id']);
    echo json_encode(['success' => true, 'id' => $pdo->lastInsertId()]);
} elseif ($method === 'DELETE') {
    $id = $_GET['id'] ?? null;
    if (!$id) {
        http_response_code(400);
        echo json_encode(['error' => 'id required']);
        exit;
    }
    $stmt = $pdo->prepare('DELETE FROM comparisons WHERE user_id=? AND id=?');
    $stmt->execute([$user['id'], $id]);
    CacheUtils::invalidate('user_comparisons_' . $user['id']);
    echo json_encode(['success' => true]);
} else {
    http_response_code(405);
}
?>
