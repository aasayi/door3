document.addEventListener("DOMContentLoaded", () => {
  const roomWrapper = document.getElementById("room-wrapper");
  const roomBg = document.getElementById("room-bg");
  const doorHotspot = document.getElementById("door-hotspot");

  let currentRoom = "room1";
  let isAnimating = false;

  // Preload gambar ke cache memori biar aset GAK PERNAH hilang/kedip pas zoom
  function preloadImages() {
    Object.values(GAME_CONFIG.rooms).forEach((room) => {
      if (room.image) {
        const img = new Image();
        img.src = room.image;
      }
    });
  }

  function initGame() {
    preloadImages();
    if (GAME_CONFIG.rooms[currentRoom]) {
      roomBg.src = GAME_CONFIG.rooms[currentRoom].image;
    }
  }

  // Fungsi Zoom In & Transisi Ruangan
  function enterNextRoom(nextRoomKey) {
    if (isAnimating) return;
    isAnimating = true;

    const currentConfig = GAME_CONFIG.rooms[currentRoom];
    const nextConfig = GAME_CONFIG.rooms[nextRoomKey];

    // Atur titik pusat zoom pas di area pintu
    gsap.set(roomWrapper, {
      transformOrigin: `${currentConfig.zoomOrigin.x} ${currentConfig.zoomOrigin.y}`
    });

    // Timeline Animasi Mulus
    gsap.timeline({
      onComplete: () => {
        isAnimating = false;
      }
    })
    // 1. Zoom in mendekati pintu
    .to(roomWrapper, {
      scale: currentConfig.targetScale,
      duration: GAME_CONFIG.animation.duration,
      ease: GAME_CONFIG.animation.ease
    })
    // 2. Transisi ganti gambar dengan fade out tipis
    .to(roomWrapper, {
      opacity: 0,
      duration: 0.15,
      onComplete: () => {
        roomBg.src = nextConfig.image;
        currentRoom = nextRoomKey;

        // Reset skala untuk ruangan baru
        gsap.set(roomWrapper, {
          scale: 1,
          transformOrigin: "center center"
        });
      }
    })
    // 3. Fade in masuk ke ruangan baru
    .to(roomWrapper, {
      opacity: 1,
      duration: 0.25
    });
  }

  // Event Klik Pintu
  doorHotspot.addEventListener("click", () => {
    if (currentRoom === "room1") {
      enterNextRoom("room2");
    }
  });

  initGame();
});