<?php
require_once __DIR__.'/../session.php';
require_once __DIR__.'/../cacheUtils.php';
header('Content-Type: application/json');
header('Cache-Control: no-store, private');

$user = require_session();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $stmt = $pdo->prepare('SELECT item_id FROM favorites WHERE user_id=?');
    $stmt->execute([$user['id']]);
    echo json_encode($stmt->fetchAll(PDO::FETCH_COLUMN));
} elseif ($method === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $item = $data['item_id'] ?? null;
    if (!$item) {
        http_response_code(400);
        echo json_encode(['error' => 'item_id required']);
        exit;
    }
    $stmt = $pdo->prepare('INSERT IGNORE INTO favorites (user_id, item_id) VALUES (?, ?)');
    $stmt->execute([$user['id'], $item]);
    CacheUtils::invalidate('user_favorites_' . $user['id']);
    echo json_encode(['success' => true]);
} elseif ($method === 'DELETE') {
    $item = $_GET['item_id'] ?? null;
    if (!$item) {
        http_response_code(400);
        echo json_encode(['error' => 'item_id required']);
        exit;
    }
    $stmt = $pdo->prepare('DELETE FROM favorites WHERE user_id=? AND item_id=?');
    $stmt->execute([$user['id'], $item]);
    CacheUtils::invalidate('user_favorites_' . $user['id']);
    echo json_encode(['success' => true]);
} else {
    http_response_code(405);
}
?>
