(function () {
  const shutter = document.getElementById("shutter");
  const flash = document.getElementById("flash");
  const printsRail = document.getElementById("printsRail");
  const strip = document.getElementById("counterStrip");
  const tpl = document.getElementById("polaroidTpl");
  const video = document.getElementById("cameraFeed");
  const canvas = document.getElementById("captureCanvas");
  const camStatus = document.getElementById("camStatus");
  const photoDesk = document.getElementById("photoDesk");

  /** 成像区宽高比 92:73（与相纸开孔一致） */
  const OUTPUT_RATIO = 92 / 73;
  const JPEG_QUALITY = 0.86;

  let count = 0;
  let counterAnimating = false;
  let streamReady = false;
  let deskZ = 200;
  let drag = null;

  const gradients = [
    "linear-gradient(160deg, #5c6b7a 0%, #8b9aab 35%, #c5d0dc 55%, #7a8fa3 100%)",
    "linear-gradient(145deg, #6b5c7a 0%, #9a8bab 40%, #dcc5e8 60%, #a37a9a 100%)",
    "linear-gradient(150deg, #4a6b6e 0%, #7aab9e 38%, #c5dcd8 58%, #7a9a93 100%)",
    "linear-gradient(155deg, #7a6b5c 0%, #ab9a8b 36%, #dcd0c5 56%, #9a8f7a 100%)",
    "linear-gradient(140deg, #3d4a5c 0%, #6b7a9a 42%, #a8b8d8 62%, #5c6b8a 100%)",
  ];

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function setCamMessage(text) {
    if (!camStatus) return;
    camStatus.textContent = text || "";
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamMessage("当前环境不支持摄像头，将使用占位画面。");
      return;
    }
    setCamMessage("正在请求摄像头权限…");
    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }
      video.srcObject = stream;
      await video.play();
      streamReady = true;
      setCamMessage("");
    } catch (err) {
      streamReady = false;
      setCamMessage(
        "无法使用摄像头：" + (err.message || "已拒绝或未连接") + "。仍可拍照（占位图）。"
      );
    }
  }

  function captureFrameDataUrl() {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;

    const ctx = canvas.getContext("2d");
    const outW = canvas.width;
    const outH = canvas.height;
    const srcRatio = vw / vh;

    let sx, sy, sw, sh;
    if (srcRatio > OUTPUT_RATIO) {
      sh = vh;
      sw = Math.round(vh * OUTPUT_RATIO);
      sx = Math.round((vw - sw) / 2);
      sy = 0;
    } else {
      sw = vw;
      sh = Math.round(vw / OUTPUT_RATIO);
      sx = 0;
      sy = Math.round((vh - sh) / 2);
    }

    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH);
    try {
      return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    } catch {
      return null;
    }
  }

  function resetStripToSingle(text) {
    if (!strip) return;
    strip.replaceChildren();
    const line = document.createElement("span");
    line.className = "counter__line";
    line.textContent = text;
    strip.appendChild(line);
    strip.style.transition = "none";
    strip.style.transform = "translateY(0)";
    void strip.offsetHeight;
    strip.style.transition = "";
  }

  function setCounterRoll(fromStr, toStr) {
    if (!strip || fromStr === toStr) return;

    if (counterAnimating) {
      strip.removeEventListener("transitionend", strip._counterTe);
      resetStripToSingle(fromStr);
    }

    counterAnimating = true;

    const lineH = strip.querySelector(".counter__line")?.offsetHeight || 17;

    strip.replaceChildren();
    const oldLine = document.createElement("span");
    oldLine.className = "counter__line";
    oldLine.textContent = fromStr;
    const newLine = document.createElement("span");
    newLine.className = "counter__line";
    newLine.textContent = toStr;
    strip.appendChild(oldLine);
    strip.appendChild(newLine);

    strip.style.transition = "none";
    strip.style.transform = "translateY(0)";
    void strip.offsetHeight;

    requestAnimationFrame(() => {
      strip.style.transition = "";
      strip.style.transform = "translateY(-" + lineH + "px)";
    });

    const onEnd = function (ev) {
      if (ev.propertyName !== "transform") return;
      strip.removeEventListener("transitionend", onEnd);
      strip._counterTe = null;
      resetStripToSingle(toStr);
      counterAnimating = false;
    };
    strip._counterTe = onEnd;
    strip.addEventListener("transitionend", onEnd);
  }

  function triggerFlash() {
    flash.classList.add("is-on");
    requestAnimationFrame(() => {
      setTimeout(() => flash.classList.remove("is-on"), 60);
    });
  }

  function applyShotToPolaroid(shotEl, dataUrl) {
    if (dataUrl) {
      shotEl.style.removeProperty("--shot");
      shotEl.style.backgroundImage =
        "linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 42%), url(" +
        dataUrl +
        ")";
      shotEl.style.backgroundSize = "cover, cover";
      shotEl.style.backgroundPosition = "center, center";
    } else {
      const pick = gradients[(count - 1) % gradients.length];
      shotEl.style.removeProperty("background-image");
      shotEl.style.removeProperty("background-size");
      shotEl.style.removeProperty("background-position");
      shotEl.style.setProperty("--shot", pick);
    }
  }

  function print() {
    const prev = count;
    count = Math.min(count + 1, 99);
    if (count > prev) {
      setCounterRoll(pad2(prev), pad2(count));
    }

    triggerFlash();

    const node = tpl.content.firstElementChild.cloneNode(true);
    const shotEl = node.querySelector(".polaroid__img");
    const dataUrl = streamReady ? captureFrameDataUrl() : null;
    applyShotToPolaroid(shotEl, dataUrl);

    printsRail.prepend(node);
  }

  function placePinned(card, clientX, clientY) {
    card.style.left = clientX - drag.offsetX + "px";
    card.style.top = clientY - drag.offsetY + "px";
  }

  function onPointerDown(e) {
    if (e.button !== 0 || !photoDesk) return;
    const card = e.target.closest(".polaroid");
    if (!card) return;
    const fromRail = card.classList.contains("polaroid--grabbable");
    const fromDesk = card.classList.contains("polaroid--pinned");
    if (!fromRail && !fromDesk) return;

    e.preventDefault();
    const rect = card.getBoundingClientRect();
    drag = {
      card,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    };

    deskZ += 1;
    card.style.zIndex = String(deskZ);
    card.classList.add("polaroid--dragging");

    if (fromRail) {
      card.classList.remove("polaroid--grabbable");
      photoDesk.appendChild(card);
      card.classList.add("polaroid--pinned");
    }

    placePinned(card, e.clientX, e.clientY);
    card.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    if (!drag) return;
    placePinned(drag.card, e.clientX, e.clientY);
  }

  function onPointerUp(e) {
    if (!drag) return;
    try {
      drag.card.releasePointerCapture(e.pointerId);
    } catch (_) {
      /* ignore */
    }
    drag.card.classList.remove("polaroid--dragging");
    drag = null;
  }

  document.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", onPointerUp);
  document.addEventListener("pointercancel", onPointerUp);

  if (printsRail) {
    printsRail.addEventListener("animationend", function (ev) {
      if (
        ev.target.classList.contains("polaroid") &&
        ev.animationName === "eject"
      ) {
        ev.target.classList.add("polaroid--grabbable");
      }
    });
  }

  shutter.addEventListener("click", print);
  startCamera();
})();
