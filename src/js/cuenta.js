import fetchWithRetry from './utils/fetchWithRetry.js';
// Asegurarse de que storageUtils esté cargado
if (typeof window.StorageUtils === 'undefined') {
    console.error('Error: storageUtils.js no está cargado');
}

const skeletonListHTML = `
    <ul class="skeleton-items">
        <li class="skeleton skeleton-item"></li>
        <li class="skeleton skeleton-item"></li>
        <li class="skeleton skeleton-item"></li>
    </ul>`;

function initAccountSkeleton() {
    const skeleton = document.getElementById('account-skeleton');
    const main = document.querySelector('main');
    if (skeleton) skeleton.style.display = 'block';
    if (main) main.style.display = 'none';
}

function hideAccountSkeleton() {
    const skeleton = document.getElementById('account-skeleton');
    const main = document.querySelector('main');
    if (skeleton) skeleton.style.display = 'none';
    if (main) main.style.display = '';
}

document.addEventListener('DOMContentLoaded', async function() {
    initAccountSkeleton();
    try {
        const resp = await fetchWithRetry('backend/api/user.php');
        if (!resp.ok) {
            window.location.href = '/login';
            return;
        }
        const user = await resp.json();

        // Actualizar el saludo con el nombre del usuario
        const greetingElement = document.querySelector('.videos-board-topic');
        if (greetingElement) {
            greetingElement.textContent = `Hola ${user.name || 'Usuario'}`;
        }

        // Mostrar el avatar del usuario en la ilustración de bienvenida
        const welcomeImg = document.querySelector('.welcome-illustration img');
        if (welcomeImg && user.avatar) {
            welcomeImg.src = user.avatar;
            welcomeImg.alt = `Avatar de ${user.name || 'usuario'}`;
        }

        // Registrar eventos de refresco
        const refreshBtn = document.getElementById('refreshFavoritos');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function() {
                const container = document.getElementById('favoritos-items-container');
                if (container) {
                    container.innerHTML = skeletonListHTML;
                    setTimeout(loadAndDisplayFavoritos, 300);
                }
            });
        }

        const refreshCompBtn = document.getElementById('refreshComparativas');
        if (refreshCompBtn) {
            refreshCompBtn.addEventListener('click', function() {
                const cont = document.getElementById('lista-comparaciones');
                if (cont) {
                    cont.innerHTML = skeletonListHTML;
                    setTimeout(loadAndDisplayComparativas, 300);
                }
            });
        }

        // Cargar y mostrar los ítems y comparativas guardadas
        await Promise.all([loadAndDisplayFavoritos(), loadAndDisplayComparativas()]);

        // Inicializar estadísticas al cargar
        await updateStats();
    } catch (err) {
        console.error('Error al cargar la cuenta:', err);
        const main = document.querySelector('main');
        if (main) {
            main.innerHTML = `
                <div class="api-error">
                    <p>Ocurrió un problema al cargar tu cuenta. Intenta de nuevo más tarde.</p>
                </div>`;
        }
    } finally {
        hideAccountSkeleton();
    }
});

/**
 * Actualiza los contadores de la sección de estadísticas (favoritos y comparaciones)
 */
async function updateStats() {
    const favs  = await window.StorageUtils?.getFavoritos() ?? [];
    const comps = await window.StorageUtils?.getComparativas() ?? [];

    const favSpan = document.getElementById('favoritosCount');
    if (favSpan) favSpan.textContent = favs.length;

    const compSpan = document.getElementById('comparacionesCount');
    if (compSpan) compSpan.textContent = comps.length;
}


/**
 * Carga y muestra los ítems guardados en la lista de favoritos
 */
async function loadAndDisplayFavoritos() {
    const container = document.getElementById('favoritos-items-container');
    if (!container) {
        console.error('No se encontró el contenedor de favoritos');
        return;
    }
    
    // Obtener los ítems guardados usando storageUtils
    const favoritos = await window.StorageUtils?.getFavoritos() ?? [];
    
    if (!favoritos.length) {
        container.innerHTML = `
            <div class="no-items">
                <span class="empty-icon" aria-hidden="true">📦</span>
                <p>No hay ítems guardados aún.</p>
                <p>Guarda ítems desde la página de detalles para verlos aquí.</p>
            </div>`;
        return;
    }
    
    // Crear lista de ítems
    const list = document.createElement('ul');
    list.className = 'favoritos-list';
    
    favoritos.forEach((item, index) => {
        const listItem = document.createElement('li');
        listItem.className = 'favorito-item';
        listItem.dataset.id = item.id;
        
        // Ícono real del ítem
        const icon = document.createElement('img');
        icon.className = 'favorito-icon';
        icon.src = 'img/sphere_5528251.svg'; // usa un placeholder local
        icon.alt = 'icono';
        icon.width = 24;
        icon.height = 24;
        
        // Enlace al ítem (nombre se actualizará tras fetch)
        const link = document.createElement('a');
        link.href = `/item?id=${item.id}`;
        link.className = 'favorito-link';
        if (item.nombre) {
            link.textContent = item.nombre;
        } else {
            link.innerHTML = '<div class="skeleton skeleton-block"></div>';
        }

        // Fetch para obtener nombre e icono reales si faltan
        fetchWithRetry(`https://api.guildwars2.com/v2/items/${item.id}?lang=es`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data) return;
                if (data.icon) icon.src = data.icon;
                if (data.name) {
                    link.textContent = data.name;
                }
            })
            .catch(err => console.error('Error fetching item detalles:', err));
        
        // ID del ítem
        const itemId = document.createElement('span');
        itemId.className = 'favorito-id';
        itemId.textContent = `#${item.id}`;
        
        // Botón para eliminar
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-favorito';
        deleteBtn.title = 'Eliminar de favoritos';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (confirm(`¿Eliminar "${item.nombre || 'este ítem'}" de favoritos?`)) {
                if (window.StorageUtils && window.StorageUtils.removeFavorito) {
                    await window.StorageUtils.removeFavorito(item.id);
                }
                listItem.remove();
                
                // Mostrar mensaje si no quedan más ítems
                if (document.querySelectorAll('.favorito-item').length === 0) {
                    container.innerHTML = `
                        <div class="no-items">
                            <span class="empty-icon" aria-hidden="true">📦</span>
                            <p>No hay ítems guardados.</p>
                        </div>`;
                }
                
                // Mostrar notificación
                window.StorageUtils?.showToast('Ítem eliminado de favoritos');

                // Actualizar estadísticas después de eliminar
                updateStats();
            }
        };
        
        // Construir la estructura del ítem
        const itemContent = document.createElement('div');
        itemContent.className = 'favorito-content';
        itemContent.appendChild(icon);
        itemContent.appendChild(link);
        itemContent.appendChild(itemId);
        
        listItem.appendChild(itemContent);
        listItem.appendChild(deleteBtn);
        list.appendChild(listItem);
    });
    
    // Limpiar contenedor y agregar la lista
    container.innerHTML = '';
    container.appendChild(list);
    
    // Añadir contador de ítems
    const counter = document.createElement('div');
    counter.className = 'favoritos-counter';
    counter.textContent = `${favoritos.length} ${favoritos.length === 1 ? 'ítem' : 'ítems'} guardados`;
    container.prepend(counter);

    // Actualizar estadísticas globales
    updateStats();
}

// ------------------ COMPARATIVAS ------------------
/**
 * Carga y muestra las comparativas guardadas
 */
async function loadAndDisplayComparativas() {
    const container = document.getElementById('lista-comparaciones');
    if (!container) {
        console.error('No se encontró el contenedor de comparativas');
        return;
    }

    const comparativas = await window.StorageUtils?.getComparativas() ?? [];

    if (!comparativas.length) {
        container.innerHTML = `
            <div class="no-items">
                <span class="empty-icon" aria-hidden="true">📦</span>
                <p>No hay comparativas guardadas.</p>
                <p>Guarda una comparativa desde la sección de comparativa para verla aquí.</p>
            </div>`;
        return;
    }

    const list = document.createElement('ul');
    list.className = 'favoritos-list';

    comparativas.forEach((comp, idx) => {
        const listItem = document.createElement('li');
        listItem.className = 'favorito-item comparativa-item';

        // Ícono
        const icon = document.createElement('span');
        icon.className = 'favorito-icon';
        icon.innerHTML = '📊';

        const nombre = Array.isArray(comp.nombres) && comp.nombres.length
            ? comp.nombres.join(' vs ')
            : `Comparativa ${idx + 1}`;
        const fecha = '';

        const link = document.createElement('a');
        link.href = `/compare-craft?ids=${comp.ids.join(',')}`;
        link.className = 'favorito-link';
        link.textContent = nombre;

        const meta = document.createElement('span');
        meta.className = 'favorito-id';
        const count = comp.ids.length;
        meta.textContent = `(${count} ${count === 1 ? 'ítem' : 'ítems'})`;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-favorito';
        deleteBtn.title = 'Eliminar comparativa';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (confirm('¿Eliminar esta comparativa?')) {
                if (window.StorageUtils && window.StorageUtils.removeComparativa) {
                    await window.StorageUtils.removeComparativa(comp.id);
                }
                listItem.remove();
                if (document.querySelectorAll('.comparativa-item').length === 0) {
                    container.innerHTML = '<p>No hay comparativas guardadas.</p>';
                }
                window.StorageUtils?.showToast('Comparativa eliminada');

                // Actualizar estadísticas después de eliminar
                updateStats();
            }
        };

        const itemContent = document.createElement('div');
        itemContent.className = 'favorito-content';
        itemContent.appendChild(icon);
        itemContent.appendChild(link);
        itemContent.appendChild(meta);

        listItem.appendChild(itemContent);
        listItem.appendChild(deleteBtn);
        list.appendChild(listItem);
    });

    container.innerHTML = '';
    container.appendChild(list);
}

