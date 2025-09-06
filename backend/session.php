<?php
require_once __DIR__.'/config.php';

function require_session() {
    global $pdo;
    if (empty($_COOKIE['session_id'])) {
        http_response_code(401);
        echo json_encode(['error' => 'No session']);
        exit;
    }
    $stmt = $pdo->prepare('SELECT users.* FROM sessions JOIN users ON sessions.user_id=users.id WHERE sessions.id=?');
    $stmt->execute([$_COOKIE['session_id']]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$user) {
        http_response_code(401);
        echo json_encode(['error' => 'Invalid session']);
        exit;
    }
    return $user;
}
?>
