// Глобальные переменные сцены
let scene, camera, renderer;
let water, playerModel, rod;
let mixer, waterMixer, npcMixer, clock;
let idleAction, walkAction;
let isWalking = false;
let time = 0;

// --- ДИАЛОГОВАЯ СИСТЕМА ---
let dialogueState = 'none'; // 'none', 'talking', 'shop'
let npcTalkingAction, npcIdleAction;
let currentOpenUI = null;

// --- ИНВЕНТАРЬ ---
let inventory = []; // Массив объектов { name, weight, price, icon }
let isHoldingFish = false;
let coins = 0; // ВАЛЮТА
let fishModels = {};
let fishHoldAction, fishWalkAction; // Новые анимации для рыбы
let currentAction = null; // Текущая активная анимация игрока
let playerHandBone = null; // Глобальная ссылка на кость руки
let heldFishModel = null;  // Клонированная модель рыбы в руках
let catchPreviewScene, catchPreviewCamera, catchPreviewRenderer, catchPreviewMixer;
let catchPreviewFish;
let playerHiddenBonesFP = []; // Массив всех костей головы/лица
let playerNeckAnchor = null;  // Якорь для камеры в 1-м лице

// --- НОВЫЕ ПЕРЕМЕННЫЕ: Управление камерой и движением ---
let isDragging = false;
let cameraAngleX = 0; // Вращение по горизонтали
let cameraAngleY = 0.2; // Наклон по вертикали
let cameraRadius = 15; // Сделали камеру чуть ближе
let isThirdPerson = false; // Режим от 3 лица
let fishingRod; // Модель удочки

// --- НОВЫЕ ПЕРЕМЕННЫЕ: Рыбалка ---
let fishingState = 'none'; // 'none', 'casting', 'animating', 'fishing'
let castingArrowPos = 0;
let castingArrowDir = 1;
let castAction, fishIdleAction;

// Границы пирса и логика рыбалки
let PIER_BOUNDS = { minX: -6.5, maxX: 6.5, minZ: -36, maxZ: 36 };
let SHACK_BOUNDS = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }; // Будет рассчитано при загрузке
let FISHING_EDGE_DIST = 1.6; // Расстояние до края для зоны рыбалки
const INTERACTION_DIST = 6.0; // Дистанция для взаимодействия с NPC

// Отслеживание нажатых клавиш
const keys = { w: false, a: false, s: false, d: false };
// --------------------------------------------

// Ждем полной загрузки страницы
window.onload = function () {
    init3D();
    animate();
};

// Инициализация 3D сцены
function init3D() {
    // 1. Создаем сцену и настраиваем фон (Небо)
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    // Уменьшаем интенсивность тумана, чтобы было видно далекие объекты
    scene.fog = new THREE.FogExp2(0x87CEEB, 0.002);

    // 2. Создаем камеру (Вид от третьего лица) - увеличиваем дальность обзора (Far plane)
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100000);
    camera.position.set(0, 8, 18); // Позиция сзади и сверху (Подняли выше)

    // 3. Создаем рендерер
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true; // Включаем тени
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // --- МЕНЕДЖЕР ЗАГРУЗКИ ---
    const loadingManager = new THREE.LoadingManager();
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const loadingScreen = document.getElementById('loading-screen');

    loadingManager.onProgress = function (url, itemsLoaded, itemsTotal) {
        const progress = (itemsLoaded / itemsTotal) * 100;
        if (progressBar) progressBar.style.width = progress + '%';
        if (progressText) progressText.innerText = Math.round(progress) + '%';
    };

    loadingManager.onLoad = function () {
        console.log('Все ресурсы загружены!');
        setTimeout(() => {
            if (loadingScreen) loadingScreen.classList.add('hidden');
            const gameHud = document.getElementById('game-hud');
            if (gameHud) gameHud.classList.remove('hidden');
        }, 500);
    };

    loadingManager.onError = function (url) {
        console.error('Ошибка при загрузке:', url);
    };

    // 4. Освещение
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5); // Мягкий общий свет
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8); // Солнце
    dirLight.position.set(100, 200, 50);
    scene.add(dirLight);

    // 5. Инициализация загрузчиков с менеджером загрузки
    const gltfLoader = new THREE.GLTFLoader(loadingManager);
    const fbxLoader = new THREE.FBXLoader(loadingManager);

    // 6. ЗАГРУЗКА 3D МОДЕЛИ ВОДЫ (Вместо старой процедурной плоскости)
    gltfLoader.load('ocean__water_perfect_loop.glb', (gltf) => {
        water = gltf.scene;
        // Чтобы вода уходила за горизонт, но волны не были как горы, масштабируем X и Z сильнее, чем Y
        water.scale.set(5, 1, 5);
        water.position.set(0, 0, 0);

        // Настройка анимации воды (если она есть в GLB)
        if (gltf.animations && gltf.animations.length > 0) {
            waterMixer = new THREE.AnimationMixer(water);
            const action = waterMixer.clipAction(gltf.animations[0]);
            action.play();
        }

        // Настройка материалов для прозрачности и теней
        water.traverse(child => {
            if (child.isMesh) {
                child.receiveShadow = true;
                // Убрали принудительную прозрачность, чтобы модель рендерилась корректно
            }
        });

        scene.add(water);
    }, undefined, (error) => {
        console.error('Ошибка загрузки океана:', error);
    });

    // 6. ЗАГРУЗКА 3D МОДЕЛИ ПОДДОНА (Территория из 4 штук)
    gltfLoader.load('old_wooden_pallet.glb', (gltf) => {
        const mainPallet = gltf.scene;
        // Масштабируем
        mainPallet.scale.set(15, 1, 15);

        // Тени для поддона
        mainPallet.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        // Вычисляем физический размер масштабированной доски
        const box = new THREE.Box3().setFromObject(mainPallet);
        const size = box.getSize(new THREE.Vector3());

        // Точный расчет границ пирса по размерам модели
        PIER_BOUNDS.minX = -size.x / 2;
        PIER_BOUNDS.maxX = size.x / 2;
        PIER_BOUNDS.minZ = (-size.z * 2) - (size.z / 2);
        PIER_BOUNDS.maxZ = (-size.z * 2 + 4 * size.z * 0.98) + (size.z / 2);

        // Вычисляем границы для новой Т-образной платформы в конце пирса
        PIER_BOUNDS.wideMinX = PIER_BOUNDS.minX - 2 * size.x * 0.98;
        PIER_BOUNDS.wideMaxX = PIER_BOUNDS.maxX + 2 * size.x * 0.98;
        PIER_BOUNDS.wideMaxZ = PIER_BOUNDS.minZ + size.z; // Глубина широкой зоны - 1 поддон

        // Выкладываем 5 досок в виде длинной дорожки (пирса) по оси Z
        for (let i = 0; i < 5; i++) {
            const clone = mainPallet.clone();
            // Центрируем дорожку так, чтобы игрок (0,0) появлялся на средней доске (i=2)
            clone.position.set(
                0,
                0.5,
                -size.z * 2 + (i * size.z * 0.98)
            );
            scene.add(clone);
        }

        // Добавляем 4 платформы (по 2 слева и справа) на дальнем конце пирса
        for (let j = 1; j <= 2; j++) {
            const cloneLeft = mainPallet.clone();
            cloneLeft.position.set(-j * size.x * 0.98, 0.5, -size.z * 2);
            scene.add(cloneLeft);

            const cloneRight = mainPallet.clone();
            cloneRight.position.set(j * size.x * 0.98, 0.5, -size.z * 2);
            scene.add(cloneRight);
        }

        // --- ЗАГРУЗКА ЗДАНИЯ (Лачуга/Магазин) ---
        gltfLoader.load('shack_style_restaurant_shop_or_booth.glb', (gltf) => {
            const shack = gltf.scene;
            shack.scale.setScalar(2); // Уменьшили в 2 раза
            shack.rotation.y = Math.PI / 2; // Повернули на 90 градусов

            // Ставим в центр расширенной Т-образной зоны
            shack.position.set(0, 0.5, -size.z * 2);

            // Рассчитываем точные границы коллизии
            const sBox = new THREE.Box3().setFromObject(shack);
            const sSize = sBox.getSize(new THREE.Vector3());
            SHACK_BOUNDS = {
                minX: shack.position.x - sSize.x * 0.45,
                maxX: shack.position.x + sSize.x * 0.45,
                minZ: shack.position.z - sSize.z * 0.45,
                maxZ: shack.position.z + sSize.z * 0.45
            };

            shack.traverse(child => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            scene.add(shack);

            // --- ДОБАВЛЯЕМ ЧЕЛОВЕКА ЗА СТОЙКУ ---
            fbxLoader.load('Breathing Idle.fbx', (npcFbx) => {
                const npc = npcFbx;
                npc.name = "NPC_Shopkeeper";
                npc.scale.setScalar(0.045 / 2);

                npc.position.set(-2.6, -0.25, 0);
                npc.rotation.y = -Math.PI / 2;

                npcMixer = new THREE.AnimationMixer(npc);
                if (npc.animations && npc.animations.length > 0) {
                    npcIdleAction = npcMixer.clipAction(npc.animations[0]);
                    npcIdleAction.play();
                }

                // Загружаем анимацию разговора
                fbxLoader.load('Talking.fbx', (talkingFbx) => {
                    if (talkingFbx.animations && talkingFbx.animations.length > 0) {
                        npcTalkingAction = npcMixer.clipAction(talkingFbx.animations[0]);
                    }
                });

                npc.traverse(child => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                shack.add(npc);
            });
        });
    }, undefined, (error) => {
        console.error('Ошибка загрузки поддона:', error);
    });

    // --- ЗАГРУЗКА 3D МОДЕЛИ ИГРОКА ---
    // 7. Инициализация часов для анимаций
    clock = new THREE.Clock();

    // Загружаем Idle анимацию и основную модель
    fbxLoader.load('Idle.fbx', (fbx) => {
        playerModel = fbx;

        // Масштабируем и позиционируем модель
        playerModel.scale.setScalar(0.015);
        playerModel.position.set(0, 0.9, 0); // Ставим на поддон

        // Настройка базовой анимации (Idle)
        mixer = new THREE.AnimationMixer(playerModel);

        // Поиск всех костей головы и лица
        console.log("--- SCANNING FOR HEAD BONES ---");
        playerHiddenBonesFP = [];
        playerNeckAnchor = null;
        playerModel.traverse(c => {
            if (c.isBone) {
                const n = c.name.toLowerCase();
                // Ищем всё, что относится к голове, шее, глазам, челюсти
                if (n.includes('head') || n.includes('neck') || n.includes('eye') || n.includes('jaw') || n.includes('mouth')) {
                    console.log("Adding to hidden:", c.name);
                    playerHiddenBonesFP.push(c);
                }
                // Находим шею как якорь для камеры
                if (n === 'mixamorigneck') {
                    playerNeckAnchor = c;
                }
            }
        });
        console.log("---------------------------");

        // При загрузке Idle.fbx
        mixer.addEventListener('finished', (e) => {
            if (e.action === castAction) {
                fishingState = 'fishing';
                if (fishIdleAction) {
                    fadeToAnimation(fishIdleAction, 0.3, true); // Используем единую функцию с форсированием
                }
                const textEl = document.getElementById('fishing-text');
                textEl.innerText = "Ждём улов...";
                textEl.style.color = "#76ff03";
                document.getElementById('fishing-text-container').classList.remove('hidden');
            }
        });

        const baseClip = getBestClip(fbx.animations);
        if (baseClip) {
            idleAction = mixer.clipAction(baseClip);
            idleAction.play(); // Начинаем с Idle
            currentAction = idleAction;
        }

        // Тени для модели
        playerModel.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        scene.add(playerModel);

        // После загрузки тела загружаем анимацию ходьбы
        fbxLoader.load('Walking (1).fbx', (walkFbx) => {
            const clip = getBestClip(walkFbx.animations);
            if (clip) walkAction = mixer.clipAction(clip);
        });

        // Загружаем анимацию заброса
        fbxLoader.load('Fishing Cast (1).fbx', (castFbx) => {
            const clip = getBestClip(castFbx.animations);
            if (clip) {
                castAction = mixer.clipAction(clip);
                castAction.setLoop(THREE.LoopOnce);
                castAction.clampWhenFinished = true;
            }
        });

        // Загружаем анимацию ожидания
        fbxLoader.load('Fishing Idle.fbx', (idleFishingFbx) => {
            const clip = getBestClip(idleFishingFbx.animations);
            if (clip) fishIdleAction = mixer.clipAction(clip);
        });

        // Загружаем удочку
        gltfLoader.load('fishing_rod.glb', (gltf) => {
            const rawScene = gltf.scene;

            // Вычисляем размер и центр модели
            const box = new THREE.Box3().setFromObject(rawScene);
            const center = box.getCenter(new THREE.Vector3());

            // Создаем обертку и смещаем оригинальный объект в [0,0,0], 
            // так как точка опоры (origin) в скачанных 3D-моделях часто сбита
            fishingRod = new THREE.Group();
            rawScene.position.sub(center); // Центрируем
            fishingRod.add(rawScene);

            // Пытаемся найти кость правой руки для прикрепления
            let rightHandBone = null;
            playerModel.traverse((child) => {
                if (child.isBone && child.name === 'mixamorigRightHand') {
                    rightHandBone = child;
                }
            });

            if (rightHandBone) {
                playerHandBone = rightHandBone; // Сохраняем в глобальную переменную
                // Масштабируем: если удочка была бы 1м в 3D редакторе (size=1), 
                // то при умножении на scale игрока 0.015 она стала бы 1.5 сантиметра.
                // Вычислим масштаб динамически, чтобы длина удочки была примерно 2-3 единицы (в координатах модели)
                // Если базовая длина size.z ~ 1-5, скейл 100 будет нормальным.
                fishingRod.scale.set(100, 100, 100);

                playerHandBone.add(fishingRod);

                // Центрируем обертку и поворачиваем
                fishingRod.position.set(25.20, 41.00, 12.80);
                fishingRod.rotation.set(-0.04 * Math.PI, -4.39 * Math.PI, 0.85 * Math.PI);
            } else {
                fishingRod.scale.set(50, 50, 50);
                playerModel.add(fishingRod);
                fishingRod.position.set(20, 100, 20);
            }
        });

        // Загружаем рыбу для превью
        gltfLoader.load('green_fish.glb', (gltf) => {
            fishModels['Herring'] = gltf.scene;
        });

        // Загружаем анимации держания рыбы
        fbxLoader.load('Pistol Idle.fbx', (fbx) => {
            const clip = getBestClip(fbx.animations);
            if (clip) {
                console.log("Pistol Idle Clip Selected, tracks:", clip.tracks.length);
                fishHoldAction = mixer.clipAction(clip);
                if (isHoldingFish && !isWalking) fadeToAnimation(fishHoldAction);
            }
        }, undefined, (err) => console.error("Error loading Pistol Idle:", err));

        fbxLoader.load('Pistol Walk.fbx', (fbx) => {
            const clip = getBestClip(fbx.animations);
            if (clip) {
                console.log("Pistol Walk Clip Selected, tracks:", clip.tracks.length);
                fishWalkAction = mixer.clipAction(clip);
                if (isHoldingFish && isWalking) fadeToAnimation(fishWalkAction);
            }
        }, undefined, (err) => console.error("Error loading Pistol Walk:", err));

    }, (xhr) => {
        console.log((xhr.loaded / xhr.total * 100) + '% loaded');
    }, (error) => {
        console.error('Ошибка загрузки модели:', error);
    });
    // ---------------------------------

    // Камеру добавляем в сцену отдельно
    scene.add(camera);

    // 10. ЗАГРУЗКА 3D НЕБА (Skybox)
    gltfLoader.load('skybox_skydays_3.glb', (gltf) => {
        const skybox = gltf.scene;
        // Оригинальная модель огромна (сотни тысяч единиц), поэтому уменьшаем масштаб
        skybox.scale.setScalar(0.001);
        skybox.position.set(0, 0, 0);

        // Настройка материалов для неба
        skybox.traverse(child => {
            if (child.isMesh && child.material) {
                child.material.fog = false; // Отключаем туман для неба, чтобы оно оставалось четким
                // Если небо вывернуто наизнанку, можно включить BackSide или DoubleSide:
                child.material.side = THREE.DoubleSide;
                child.material.depthWrite = false; // Небо не должно перекрывать объекты
            }
        });

        scene.add(skybox);
    }, undefined, (error) => {
        console.error('Ошибка загрузки скайбокса:', error);
    });

    // Адаптация при изменении размера окна
    window.addEventListener('resize', onWindowResize, false);

    // --- НОВОЕ: СЛУШАТЕЛИ СОБЫТИЙ ДЛЯ КАМЕРЫ ---

    // Отключаем стандартное меню браузера на правую кнопку мыши
    document.addEventListener('contextmenu', event => event.preventDefault());

    // Нажатие мыши
    document.addEventListener('mousedown', (event) => {
        const loadingScreen = document.getElementById('loading-screen');
        const isLoaded = loadingScreen && loadingScreen.classList.contains('hidden');

        // Проверка: если клик был по элементам интерфейса, игнорируем его для логики игры
        if (event.target.closest('button') || event.target.closest('.inventory-item') || event.target.closest('.shop-item') || event.target.closest('.dialogue-box')) {
            return;
        }

        // Проверяем, что нажата правая кнопка (2) и загрузка завершена
        if (event.button === 2 && isLoaded) {
            isDragging = true;
            // Блокируем и скрываем курсор для бесконечного вращения
            document.body.requestPointerLock();
        } else if (event.button === 0 && isLoaded && dialogueState === 'none' && !isHoldingFish) {
            // ЛЕВАЯ КНОПКА МЫШИ - РЫБАЛКА (Только если не держим рыбу)
            if (fishingState === 'none') {
                // Проверка зоны рыбалки
                if (playerModel) {
                    const p = playerModel.position;
                    const d = FISHING_EDGE_DIST;

                    const checkInside = (x, z) => {
                        if (x >= PIER_BOUNDS.minX && x <= PIER_BOUNDS.maxX && z >= PIER_BOUNDS.minZ && z <= PIER_BOUNDS.maxZ) return true;
                        if (x >= (PIER_BOUNDS.wideMinX || 0) && x <= (PIER_BOUNDS.wideMaxX || 0) && z >= PIER_BOUNDS.minZ && z <= (PIER_BOUNDS.wideMaxZ || 0)) return true;
                        return false;
                    };

                    // Если смещение на d в любую из 4 сторон выводит нас в воду, значит мы на краю!
                    const isNearEdge = !(checkInside(p.x + d, p.z) && checkInside(p.x - d, p.z) && checkInside(p.x, p.z + d) && checkInside(p.x, p.z - d));

                    if (!isNearEdge) {
                        const textEl = document.getElementById('fishing-text');
                        textEl.innerText = "Здесь нельзя сделать улов.";
                        textEl.style.color = "#ff5252";
                        document.getElementById('fishing-text-container').classList.remove('hidden');
                        document.getElementById('fishing-ui').classList.remove('hidden');
                        setTimeout(() => {
                            if (fishingState === 'none') {
                                document.getElementById('fishing-text-container').classList.add('hidden');
                                document.getElementById('fishing-ui').classList.add('hidden');
                            }
                        }, 2000);
                        return;
                    }
                }

                if (isWalking && walkAction) walkAction.stop();
                isWalking = false;
                if (idleAction) idleAction.play();

                fishingState = 'casting';
                document.getElementById('fishing-ui').classList.remove('hidden');
                document.getElementById('casting-bar-container').classList.remove('hidden');

                const textEl = document.getElementById('fishing-text');
                textEl.innerText = "Настраиваем...";
                textEl.style.color = "#ffffff";
                document.getElementById('fishing-text-container').classList.remove('hidden');

                castingArrowPos = 0;
                castingArrowDir = 1;
            } else if (fishingState === 'casting') {
                fishingState = 'animating';
                document.getElementById('casting-bar-container').classList.add('hidden');

                // Шанс провала в красной зоне (0-30%)
                if (castingArrowPos < 30 && Math.random() < 0.6) {
                    fishingState = 'none';
                    const textEl = document.getElementById('fishing-text');
                    textEl.innerText = "Настройка не удалась!";
                    textEl.style.color = "#ff5252";
                    document.getElementById('fishing-text-container').classList.remove('hidden');
                    setTimeout(() => {
                        document.getElementById('fishing-text-container').classList.add('hidden');
                        document.getElementById('fishing-ui').classList.add('hidden');
                    }, 2000);
                } else {
                    // Успех, играем Cast
                    if (idleAction) idleAction.stop();
                    if (walkAction) walkAction.stop();
                    isWalking = false;

                    if (castAction) {
                        castAction.reset();
                        castAction.play();
                    } else {
                        fishingState = 'fishing';
                        if (fishIdleAction) {
                            fishIdleAction.reset();
                            fishIdleAction.play();
                        }
                        const textEl = document.getElementById('fishing-text');
                        textEl.innerText = "Ждём улов...";
                        textEl.style.color = "#76ff03";
                        document.getElementById('fishing-text-container').classList.remove('hidden');
                    }
                }
            } else if (fishingState === 'fishing') {
                // Отмена рыбалки
                fishingState = 'none';
                document.getElementById('fishing-ui').classList.add('hidden');
                if (fishIdleAction) fishIdleAction.stop();
                if (idleAction) idleAction.play();
            }
        }
    });

    // Движение мыши
    document.addEventListener('mousemove', (event) => {
        if (isDragging) {
            // Используем movementX/Y — они показывают чистое смещение мыши, 
            // даже если курсор скрыт и заблокирован на месте
            const deltaX = event.movementX || 0;
            const deltaY = event.movementY || 0;

            // Изменяем углы в зависимости от движения (чувствительность 0.005)
            cameraAngleX -= deltaX * 0.005;
            cameraAngleY -= deltaY * 0.005; // Исправлена инверсия (теперь мышь вверх = взгляд вверх)

            // Ограничиваем наклон (Pitch), чтобы нельзя было посмотреть себе за спину через верх или низ
            cameraAngleY = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, cameraAngleY));
        }
    });

    // Отпускание мыши
    document.addEventListener('mouseup', (event) => {
        if (event.button === 2) {
            isDragging = false;
            // Освобождаем и возвращаем курсор при отпускании кнопки
            if (document.pointerLockElement === document.body) {
                document.exitPointerLock();
            }
        }
    });

    // --- НОВОЕ: УПРАВЛЕНИЕ КЛАВИАТУРОЙ (WASD) ---
    document.addEventListener('keydown', (event) => {
        if (event.code === 'KeyW' || event.code === 'ArrowUp') keys.w = true;
        if (event.code === 'KeyA' || event.code === 'ArrowLeft') keys.a = true;
        if (event.code === 'KeyS' || event.code === 'ArrowDown') keys.s = true;
        if (event.code === 'KeyD' || event.code === 'ArrowRight') keys.d = true;
        if (event.code === 'KeyV') isThirdPerson = true;

        if (event.code === 'KeyE') {
            const hintEl = document.getElementById('interaction-hint');
            if (hintEl && !hintEl.classList.contains('hidden') && dialogueState === 'none') {
                startDialogue();
            } else if (dialogueState === 'talking') {
                // Если мы уже говорим, Е может закрывать? По заданию не сказано, 
                // но лучше оставить только выбор вариантов.
            }
        }
    });

    document.addEventListener('keyup', (event) => {
        if (event.code === 'KeyW' || event.code === 'ArrowUp') keys.w = false;
        if (event.code === 'KeyA' || event.code === 'ArrowLeft') keys.a = false;
        if (event.code === 'KeyS' || event.code === 'ArrowDown') keys.s = false;
        if (event.code === 'KeyD' || event.code === 'ArrowRight') keys.d = false;
        if (event.code === 'KeyV') isThirdPerson = false;
    });
    // -------------------------------------------
}

// Функция адаптации размера 3D экрана
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}


// Главный цикл анимации (вызывается ~60 раз в секунду)
function animate() {
    requestAnimationFrame(animate);
    const delta = clock ? clock.getDelta() : 0;
    time += 0.02; // Скорость течения времени

    // Обновление позиции удочки в зависимости от стейта
    if (fishingRod) {
        // Изменяем положение только для Fishing Idle
        if (fishingState === 'fishing') {
            fishingRod.position.set(24.8, 67.2, 14.1);
            fishingRod.rotation.set(-1.57 * Math.PI, -2.1 * Math.PI, -0.33 * Math.PI);
        } else {
            fishingRod.position.set(25.20, 41.00, 12.80);
            fishingRod.rotation.set(-0.04 * Math.PI, -4.39 * Math.PI, 0.85 * Math.PI);
        }
    }

    // Обновление анимаций
    if (mixer) mixer.update(delta);
    if (waterMixer) waterMixer.update(delta);
    if (npcMixer) npcMixer.update(delta);

    // ПОСЛЕ ОБНОВЛЕНИЯ МИКСЕРА: принудительно скрываем голову в 1-м лице
    if (!isThirdPerson && playerHiddenBonesFP.length > 0) {
        playerHiddenBonesFP.forEach(bone => {
            bone.scale.setScalar(0.0001);
        });
    } else if (isThirdPerson && playerHiddenBonesFP.length > 0) {
        // Возвращаем в 3-м лице
        playerHiddenBonesFP.forEach(bone => {
            bone.scale.setScalar(1.0);
        });
    }

    // --- ЛОГИКА ШКАЛЫ РЫБАЛКИ ---
    if (fishingState === 'casting') {
        const arrowSpeed = 150 * delta; // Скорость колебания
        castingArrowPos += arrowSpeed * castingArrowDir;
        if (castingArrowPos >= 100) {
            castingArrowPos = 100;
            castingArrowDir = -1;
        } else if (castingArrowPos <= 0) {
            castingArrowPos = 0;
            castingArrowDir = 1;
        }
        document.getElementById('casting-arrow').style.left = castingArrowPos + '%';
    }

    // --- ЛОГИКА ДВИЖЕНИЯ ИГРОКА ---
    if (playerModel) {
        let moveX = 0;
        let moveZ = 0;

        if (keys.w && fishingState === 'none' && dialogueState === 'none') moveZ -= 1;
        if (keys.s && fishingState === 'none' && dialogueState === 'none') moveZ += 1;
        if (keys.a && fishingState === 'none' && dialogueState === 'none') moveX -= 1;
        if (keys.d && fishingState === 'none' && dialogueState === 'none') moveX += 1;

        // --- ЛОГИКА ШАНСА УЛОВА ---
        if (fishingState === 'fishing') {
            if (Math.random() < 0.005) { // ~0.5% шанс каждый кадр (~1 раз в 3-5 секунд)
                catchFish();
            }
        }

        // Если есть движение
        if (moveX !== 0 || moveZ !== 0) {
            const length = Math.sqrt(moveX * moveX + moveZ * moveZ);
            moveX /= length;
            moveZ /= length;

            const speed = 0.15;

            const forwardX = -Math.sin(cameraAngleX);
            const forwardZ = -Math.cos(cameraAngleX);
            const rightX = Math.cos(cameraAngleX);
            const rightZ = -Math.sin(cameraAngleX);

            const dirX = forwardX * -moveZ + rightX * moveX;
            const dirZ = forwardZ * -moveZ + rightZ * moveX;

            let newX = playerModel.position.x + dirX * speed;
            let newZ = playerModel.position.z + dirZ * speed;

            const checkInside = (x, z) => {
                // Границы пирса
                let onPallet = false;
                if (x >= PIER_BOUNDS.minX && x <= PIER_BOUNDS.maxX && z >= PIER_BOUNDS.minZ && z <= PIER_BOUNDS.maxZ) onPallet = true;
                if (x >= (PIER_BOUNDS.wideMinX || 0) && x <= (PIER_BOUNDS.wideMaxX || 0) && z >= PIER_BOUNDS.minZ && z <= (PIER_BOUNDS.wideMaxZ || 0)) onPallet = true;

                // Если мы на поддоне, проверяем коллизию со зданием
                if (onPallet) {
                    const inShack = (x >= SHACK_BOUNDS.minX && x <= SHACK_BOUNDS.maxX && z >= SHACK_BOUNDS.minZ && z <= SHACK_BOUNDS.maxZ);
                    return !inShack; // Можно идти, если НЕ внутри здания
                }
                return false;
            };

            // Невидимые стены с учетом формы пирса (позволяет скользить вдоль стен)
            if (checkInside(newX, playerModel.position.z)) {
                playerModel.position.x = newX;
            }
            if (checkInside(playerModel.position.x, newZ)) {
                playerModel.position.z = newZ;
            }

            // Включаем анимацию ходьбы
            if (!isWalking) {
                if (isHoldingFish) {
                    fadeToAnimation(fishWalkAction);
                } else {
                    fadeToAnimation(walkAction);
                }
                isWalking = true;
            }
        } else {
            // Останавливаем ходьбу и переходим в Idle
            if (isWalking) {
                if (isHoldingFish) {
                    fadeToAnimation(fishHoldAction);
                } else {
                    if (fishingState === 'none') fadeToAnimation(idleAction);
                }
                isWalking = false;
            }
        }
    }

    // --- ПОЗИЦИОНИРОВАНИЕ КАМЕРЫ ---
    if (playerModel) {
        const forwardX = -Math.sin(cameraAngleX);
        const forwardZ = -Math.cos(cameraAngleX);

        // ЖЕСТКАЯ ФИКСАЦИЯ: персонаж всегда поворачивается туда, куда смотрит камера
        playerModel.rotation.y = Math.atan2(forwardX, forwardZ);

        if (!isThirdPerson) {
            // От первого лица - КРЕПИМ КАМЕРУ К ШЕЕ
            if (playerNeckAnchor) {
                const neckPos = new THREE.Vector3();
                playerNeckAnchor.getWorldPosition(neckPos);

                // Смещаем камеру чуть выше шеи (на уровень глаз) и чуть вперед
                const eyeHeight = 0.45;
                const eyeForward = 0.15;

                camera.position.x = neckPos.x + forwardX * eyeForward;
                camera.position.y = neckPos.y + eyeHeight;
                camera.position.z = neckPos.z + forwardZ * eyeForward;
            } else {
                // Фаллбек если кость не найдена
                camera.position.x = playerModel.position.x + forwardX * 0.2;
                camera.position.y = playerModel.position.y + 5.1;
                camera.position.z = playerModel.position.z + forwardZ * 0.2;
            }

            if (camera.near !== 0.05) {
                camera.near = 0.05;
                camera.updateProjectionMatrix();
            }

            // Определяем точку, куда смотрит камера
            const lookX = camera.position.x + forwardX * Math.cos(cameraAngleY);
            const lookY = camera.position.y + Math.sin(cameraAngleY);
            const lookZ = camera.position.z + forwardZ * Math.cos(cameraAngleY);

            camera.lookAt(lookX, lookY, lookZ);
        } else {
            // От третьего лица
            // Возвращаем стандартный near plane
            if (camera.near !== 0.5) {
                camera.near = 0.5;
                camera.updateProjectionMatrix();
            }

            const distance = 10;
            const heightOffset = 7;

            camera.position.x = playerModel.position.x - forwardX * distance;
            camera.position.y = playerModel.position.y + heightOffset;
            camera.position.z = playerModel.position.z - forwardZ * distance;

            // Определяем точку, куда смотрит камера
            const lookX = playerModel.position.x + forwardX * 10 * Math.cos(cameraAngleY);
            const lookY = playerModel.position.y + 3 + 10 * Math.sin(cameraAngleY);
            const lookZ = playerModel.position.z + forwardZ * 10 * Math.cos(cameraAngleY);

            camera.lookAt(lookX, lookY, lookZ);
        }
    }

    // --- ПРОВЕРКА БЛИЗОСТИ К NPC ---
    const hintEl = document.getElementById('interaction-hint');
    if (playerModel && hintEl) {
        // Ищем NPC более надежно
        const npc = scene.getObjectByName("NPC_Shopkeeper");

        if (npc) {
            const worldPos = new THREE.Vector3();
            npc.getWorldPosition(worldPos);
            const dist = playerModel.position.distanceTo(worldPos);

            const loadingScreen = document.getElementById('loading-screen');
            const isLoaded = loadingScreen && loadingScreen.classList.contains('hidden');

            // Увеличили дистанцию до 8, так как здание довольно крупное
            if (dist < 8.0 && isLoaded && fishingState === 'none' && dialogueState === 'none') {
                hintEl.classList.remove('hidden');
            } else {
                hintEl.classList.add('hidden');
            }
        } else {
            hintEl.classList.add('hidden');
        }
    }

    renderer.render(scene, camera);
}

// --- ФУНКЦИИ ДИАЛОГОВОЙ СИСТЕМЫ ---

function startDialogue() {
    dialogueState = 'talking';
    document.getElementById('dialogue-ui').classList.remove('hidden');
    document.getElementById('interaction-hint').classList.add('hidden');

    // Проигрываем анимацию разговора
    if (npcTalkingAction) {
        if (npcIdleAction) npcIdleAction.fadeOut(0.5);
        npcTalkingAction.reset().fadeIn(0.5).play();
    }

    npcSay("Привет! Ты что-нибудь хотел?", [
        { text: "1. Хочу купить удочки", callback: () => openShop('rod-shop-ui') },
        { text: "2. Хочу купить лодку", callback: () => openShop('boat-shop-ui') },
        { text: "3. Продать рыбу", callback: () => sellFishSubMenu() },
        { text: "4. Ничего", callback: () => finishDialogue() }
    ]);
}

function sellFishSubMenu() {
    npcSay("Что ты хочешь сделать?", [
        { text: "Продать весь улов", callback: () => sellAllFish() },
        { text: "Продать одну рыбу", callback: () => sellOneFish() },
        { text: "Назад", callback: () => startDialogue() }
    ]);
}

function sellAllFish() {
    if (inventory.length <= 0) {
        npcSay("Боюсь у тебя нету ни одной рыбы, иди налови немного, и затем сможешь продать её мне!", [
            { text: "Понятно", callback: () => finishDialogue() }
        ]);
    } else {
        let totalCoins = 0;
        inventory.forEach(f => totalCoins += f.price);
        coins += totalCoins;
        updateCurrencyUI();
        console.log(`Продано ${inventory.length} рыб за ${totalCoins} монет.`);
        inventory = [];

        // СБРОС СОСТОЯНИЯ: если мы что-то продали, возвращаемся к удочке
        resetHoldingState();

        npcSay(`Отлично! Спасибо за улов. Вот твои ${totalCoins} монет.`, [
            { text: "Спасибо!", callback: () => finishDialogue() }
        ]);
    }
}

function sellOneFish() {
    if (!isHoldingFish) {
        npcSay("У тебя в руках нету рыбы, иди возми рыбу или слови её!", [
            { text: "Ой, сейчас...", callback: () => finishDialogue() }
        ]);
    } else {
        if (inventory.length > 0) {
            const fish = inventory.pop();
            coins += fish.price;
            updateCurrencyUI();

            // Используем единый сброс состояния
            resetHoldingState();

            npcSay(`Хорошая рыбка (${fish.name}, ${fish.weight.toFixed(2)}кг)! Приходи еще. Масштаб цены: ${fish.price} монет.`, [
                { text: "Обязательно!", callback: () => finishDialogue() }
            ]);
        } else {
            npcSay("Постой-ка, кажется ты меня обманываешь...", [
                { text: "Извини!", callback: () => finishDialogue() }
            ]);
            resetHoldingState();
        }
    }
}

function npcSay(text, options = []) {
    const textEl = document.getElementById('dialogue-text');
    const optionsEl = document.getElementById('dialogue-options');

    textEl.innerText = text;
    optionsEl.innerHTML = '';

    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'dialogue-option-btn';
        btn.innerText = opt.text;
        btn.onclick = opt.callback;
        optionsEl.appendChild(btn);
    });
}

function openShop(shopId) {
    dialogueState = 'shop';
    document.getElementById('dialogue-ui').classList.add('hidden');
    document.getElementById(shopId).classList.remove('hidden');
    currentOpenUI = shopId;
}

function closeShop(shopId) {
    document.getElementById(shopId).classList.add('hidden');
    finishDialogue();
}

function finishDialogue() {
    dialogueState = 'talking'; // Показываем прощальную фразу
    document.getElementById('dialogue-ui').classList.remove('hidden');

    npcSay("Ладно, до встречи!", [
        {
            text: "Закрыть", callback: () => {
                document.getElementById('dialogue-ui').classList.add('hidden');
                dialogueState = 'none';
                // Возвращаемся к Idle анимации
                if (npcIdleAction) {
                    if (npcTalkingAction) npcTalkingAction.fadeOut(0.5);
                    npcIdleAction.reset().fadeIn(0.5).play();
                }
            }
        }
    ]);
}

// Глобальные функции для HTML кнопок
window.closeShop = closeShop;
window.openInventory = openInventory;
window.closeInventory = closeInventory;
window.closeCatchWindow = closeCatchWindow;

// --- НОВЫЕ ФУНКЦИИ ЛОВЛИ И ИНВЕНТАРЯ ---

function catchFish() {
    fishingState = 'none';
    document.getElementById('fishing-ui').classList.add('hidden');
    if (fishIdleAction) fishIdleAction.stop();
    if (idleAction) idleAction.play();

    const weight = 0.5 + Math.random() * 1.5;
    const price = Math.round(20 + (weight - 0.5) * (180 / 1.5));

    const caughtFish = {
        name: "Селёдка",
        weight: weight,
        price: price,
        icon: "🐟"
    };

    inventory.push(caughtFish);
    showCatchWindow(caughtFish);
}

function showCatchWindow(fish) {
    document.getElementById('catch-ui').classList.remove('hidden');
    document.getElementById('catch-name').innerText = fish.name;
    document.getElementById('catch-weight').innerText = fish.weight.toFixed(2) + " кг";
    document.getElementById('catch-price').innerText = fish.price + " монет";

    if (!catchPreviewRenderer) {
        const container = document.getElementById('catch-preview-container');
        catchPreviewScene = new THREE.Scene();
        catchPreviewCamera = new THREE.PerspectiveCamera(45, container.offsetWidth / container.offsetHeight, 0.1, 1000);
        catchPreviewCamera.position.set(0, 0, 5);

        catchPreviewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        catchPreviewRenderer.setSize(container.offsetWidth, container.offsetHeight);
        container.appendChild(catchPreviewRenderer.domElement);

        const light = new THREE.AmbientLight(0xffffff, 1.5);
        catchPreviewScene.add(light);
    }

    if (catchPreviewFish) catchPreviewScene.remove(catchPreviewFish);

    if (fishModels['Herring']) {
        catchPreviewFish = fishModels['Herring'].clone();
        catchPreviewFish.scale.setScalar(1.2); // Уменьшили размер (было 2)
        catchPreviewScene.add(catchPreviewFish);
    }

    function updatePreview() {
        if (!document.getElementById('catch-ui').classList.contains('hidden')) {
            requestAnimationFrame(updatePreview);
            if (catchPreviewFish) {
                catchPreviewFish.rotation.y += 0.01;
                catchPreviewFish.rotation.x += 0.005;
            }
            catchPreviewRenderer.render(catchPreviewScene, catchPreviewCamera);
        }
    }
    updatePreview();
}

function closeCatchWindow(event) {
    if (event) event.stopPropagation();
    document.getElementById('catch-ui').classList.add('hidden');
}

function openInventory(event) {
    if (event) event.stopPropagation();
    if (dialogueState !== 'none') return;
    document.getElementById('inventory-ui').classList.remove('hidden');
    renderInventory();
}

function closeInventory(event) {
    if (event) event.stopPropagation();
    document.getElementById('inventory-ui').classList.add('hidden');
}

function renderInventory() {
    const list = document.getElementById('inventory-list');
    list.innerHTML = '';

    inventory.forEach((fish, index) => {
        const item = document.createElement('div');
        item.className = 'inventory-item';
        item.innerHTML = `
            <div class="inv-icon">${fish.icon}</div>
            <div class="inv-name">${fish.name}</div>
            <div class="inv-weight">${fish.weight.toFixed(2)} кг</div>
        `;
        item.onclick = () => selectFishFromInventory(index);
        list.appendChild(item);
    });
}

function selectFishFromInventory(index) {
    closeInventory();

    if (isHoldingFish) {
        // Если уже держим рыбу, используем сброс
        resetHoldingState();
    } else {
        // Если не держим рыбу, берем её и прячем удочку
        isHoldingFish = true;
        if (fishingRod) fishingRod.visible = false;

        // Добавляем модель рыбы в руку
        if (playerHandBone && fishModels['Herring']) {
            heldFishModel = fishModels['Herring'].clone();
            // Масштабируем рыбу для руки (уменьшили по просьбе юзера с 80 до 50)
            heldFishModel.scale.setScalar(50);
            // Позиция: нужно подправить, чтобы лежала в ладони
            heldFishModel.position.set(20.0, 45.0, 10.0);
            heldFishModel.rotation.set(0, Math.PI / 2, Math.PI / 4);
            playerHandBone.add(heldFishModel);
        }

        fadeToAnimation(fishHoldAction);
    }
}

// ХЕЛПЕР: Сброс состояния удержания рыбы и возврат к удочке
function resetHoldingState() {
    isHoldingFish = false;

    // Удаляем модель рыбы из руки
    if (heldFishModel) {
        if (heldFishModel.parent) {
            heldFishModel.parent.remove(heldFishModel);
        }
        heldFishModel = null;
    }

    // Возвращаем видимость удочки
    if (fishingRod) {
        fishingRod.visible = true;
    }

    // "Ядерная" очистка анимаций - останавливаем всё, чтобы ни одна кость не "залипла"
    if (mixer) {
        mixer.stopAllAction();
    }
    currentAction = null;

    // Снимаем анимацию удержания (форсированно)
    if (isWalking) {
        fadeToAnimation(walkAction, 0.1, true);
    } else {
        fadeToAnimation(idleAction, 0.1, true);
    }
}

function updateCurrencyUI() {
    const amountEl = document.getElementById('currency-amount');
    if (amountEl) amountEl.innerText = coins;
}

// Система плавного переключения анимаций (Deep Fix + Sequence Locking)
function fadeToAnimation(newAction, duration = 0.05, force = false) { // Еще более резкий переход (0.05 вместо 0.1)
    // Если проигрывается важная анимация (заброс), блокируем смену до завершения (если не форсируем)
    if (!force && fishingState === 'casting') return;

    // Фаллбек: если спец-анимация не загружена, паримся на стандартную
    if (!newAction) {
        if (isHoldingFish) {
            newAction = isWalking ? fishWalkAction : fishHoldAction;
        } else {
            newAction = isWalking ? walkAction : idleAction;
        }
    }

    if (!newAction) return;

    // Если анимация уже играет, не перезапускаем её (если это не заброс)
    if (currentAction === newAction && newAction !== castAction) {
        if (!newAction.isRunning()) newAction.play();
        return;
    }

    if (currentAction) {
        // Принудительно останавливаем старую анимацию, если переход мгновенный или форсированный
        if (duration < 0.1 || force) {
            currentAction.stop();
        } else {
            currentAction.fadeOut(duration);
        }
    }

    newAction.reset();
    newAction.setEffectiveTimeScale(1);
    newAction.setEffectiveWeight(1);

    if (duration > 0) newAction.fadeIn(duration);
    newAction.play();

    currentAction = newAction;
}

// Хак для исправления имен костей в анимациях Mixamo (удаление двоеточий)
function fixMixamoTracks(clip) {
    if (!clip) return;
    clip.tracks.forEach(track => {
        // Убираем только двоеточие: 'mixamorig:Hips.position' -> 'mixamorigHips.position'
        // Это должно совпадать с 'mixamorigHips', если модель использует такие имена.
        track.name = track.name.replace(/:/g, '');

        // Если кости в модели вообще без 'mixamorig', можно добавить еще один .replace('mixamorig', '')
    });
    return clip;
}

// Помощник для выбора лучшей анимации из списка (ищет ту, где больше всего дорожек)
function getBestClip(animations) {
    if (!animations || animations.length === 0) return null;
    if (animations.length === 1) return fixMixamoTracks(animations[0]);

    // Ищем клип с максимальным кол-вом дорожек
    let best = animations[0];
    animations.forEach(anim => {
        if (anim.tracks.length > best.tracks.length) {
            best = anim;
        }
    });
    return fixMixamoTracks(best);
}

// Помощник для остановки всех основных анимаций игрока
function stopMainAnimations() {
    if (idleAction) idleAction.fadeOut(0.2);
    if (walkAction) walkAction.fadeOut(0.2);
    if (fishHoldAction) fishHoldAction.fadeOut(0.2);
    if (fishWalkAction) fishWalkAction.fadeOut(0.2);
    if (castAction) castAction.stop();
    if (fishIdleAction) fishIdleAction.stop();
    currentAction = null;
}

