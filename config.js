const GAME_CONFIG = {
  rooms: {
    room1: {
      image: "assets/room1.webp", // Disarankan format .webp
      zoomOrigin: { x: "50%", y: "50%" }, // Titik fokus zoom ke pintu
      targetScale: 3.5
    },
    room2: {
      image: "assets/room2.webp",
      zoomOrigin: { x: "50%", y: "50%" },
      targetScale: 1
    }
  },
  animation: {
    duration: 1.0,
    ease: "power2.inOut"
  }
};