import { toPng } from "html-to-image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import "./App.css";

const ADMIN_UID = "er0oLFC6uuTQNMHCIOla12BTIqS2";

const gameRef = doc(db, "settings", "game");
const playersRef = collection(db, "players");

const POINTS_PER_STAGE = 200;
const MINUTE_MS = 60 * 1000;

function timestampMs(value) {
  return value?.toMillis?.() ?? 0;
}

function getActiveElapsedMs(game, now = Date.now()) {
  const accumulated = game?.accumulatedActiveMs ?? 0;

  if (game?.status !== "active") {
    return accumulated;
  }

  const resumedAt = timestampMs(game?.resumedAt);

  if (!resumedAt) {
    return accumulated;
  }

  return accumulated + Math.max(0, now - resumedAt);
}

function calculateStagePoints(elapsedMs) {
  const completedMinutes = Math.floor(
    Math.max(0, elapsedMs) / MINUTE_MS
  );

  return Math.max(0, POINTS_PER_STAGE - completedMinutes);
}

const STAGES = [
  {
    title: "الإشارة المفقودة",
    points: 200,
    type: "binary",
    question:
      "التقطت شبكة NOVA آخر حزمة بيانات قبل الانقطاع. المطلوب تحويل البايت الثنائي التالي إلى عدد عشري لتحديد منفذ الاستعادة.",
    code: "00101010",
    placeholder: "العدد العشري",
  },
  {
    title: "الخوارزمية المعطوبة",
    points: 200,
    type: "python",
    question:
      "النظام يعرض ناتجًا غير صحيح. المطلوب حساب الناتج الصحيح للكود بعد إصلاح الخطأ: يجب جمع الأعداد الزوجية فقط، دون استثناء آخر عنصر.",
    code: `values = [3, 6, 9, 12]
total = 0
for i in range(len(values) - 1):
    if values[i] % 2 == 0:
        total += values[i]
print(total)`,
    placeholder: "الناتج الصحيح",
  },
  {
    title: "ذاكرة المدينة",
    points: 200,
    type: "json",
    question:
      "قاعدة البيانات متضررة. المطلوب تحديد معرّف العقدة الوحيدة التي حالتها active، وchecksum لها valid، وزمن استجابتها أقل من 50ms.",
    code: `[
  {"id":"A2","status":"active","checksum":"invalid","latency":20},
  {"id":"B4","status":"inactive","checksum":"valid","latency":30},
  {"id":"C7","status":"active","checksum":"valid","latency":42},
  {"id":"D9","status":"active","checksum":"valid","latency":85}
]`,
    placeholder: "معرّف العقدة",
  },
  {
    title: "النظام المتناقض",
    points: 200,
    type: "logic",
    question:
      "يجب تنفيذ أول شرط متحقق فقط. وفق ترتيب الشروط وقيم المتغيرات، ما اسم الإجراء النهائي الذي سينفذه النظام؟",
    code: `intrusion = true
backup = true
maintenance = false

if (maintenance) action = "RESTART";
else if (intrusion && backup) action = "ISOLATE";
else if (intrusion) action = "ALERT";
else action = "MONITOR";`,
    placeholder: "اسم الإجراء بالإنجليزية",
  },
  {
    title: "بروتوكول الاستعادة",
    points: 200,
    type: "final",
    question:
      "المطلوب جمع أدلة المراحل الأربع السابقة بالترتيب: المنفذ العشري، الناتج الصحيح، معرّف العقدة، وإجراء الحماية. تُفصل الإجابات بشرطة (-) دون مسافات.",
    code: "PORT - SUM - NODE - ACTION",
    placeholder: "مثال للتنسيق: 10-20-A1-ALERT",
  },
];

const DETECTIVE_RANKS = [
  {
    min: 900,
    title: "المحقق الأسطوري",
    type: "LEGENDARY DETECTIVE",
    icon: "✦",
  },
  {
    min: 650,
    title: "المحقق الخبير",
    type: "EXPERT DETECTIVE",
    icon: "★",
  },
  {
    min: 350,
    title: "المحقق المتقدم",
    type: "ADVANCED DETECTIVE",
    icon: "◆",
  },
  {
    min: 0,
    title: "المحقق المستكشف",
    type: "EXPLORER DETECTIVE",
    icon: "◇",
  },
];

function getDetectiveRank(points) {
  return DETECTIVE_RANKS.find((rank) => points >= rank.min);
}

function FinalePage({ player, leaderboard }) {
  const points = player.points || 0;
  const rank = getDetectiveRank(points);

  const position =
    leaderboard.findIndex(
      (person) => person.name === player.name
    ) + 1;

  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const cardRef = useRef(null);
  const finaleLeaderboardRef = useRef(null);

  useEffect(() => {
    if (!showLeaderboard) return;

    const timer = window.setTimeout(() => {
      finaleLeaderboardRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 120);

    return () => window.clearTimeout(timer);
  }, [showLeaderboard]);

  async function downloadCard() {
    if (!cardRef.current || downloading) return;

    setDownloading(true);

    try {
      await document.fonts.ready;

      const card = cardRef.current;

      const width = Math.ceil(
        card.getBoundingClientRect().width
      );

      const height = Math.ceil(
        card.getBoundingClientRect().height
      );

      const dataUrl = await toPng(card, {
        pixelRatio: 3,
        cacheBust: true,
        backgroundColor: "#ffffff",
        width,
        height,
        style: {
          width: `${width}px`,
          height: `${height}px`,
          maxWidth: "none",
          margin: "0",
          transform: "none",
          animation: "none",
          direction: "rtl",
        },
      });

      const link = document.createElement("a");

      link.download = `NOVA-Detective-${player.name
        .trim()
        .replace(/[^\p{L}\p{N}-]+/gu, "-")}.png`;

      link.href = dataUrl;

      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error("Card download failed:", error);
      alert("تعذر تحميل البطاقة، يرجى المحاولة مجددًا.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="nova-finale" dir="rtl">
      <div className="nova-confetti" aria-hidden="true">
        {Array.from({ length: 55 }, (_, index) => (
          <span
            key={index}
            style={{
              "--x": `${(index * 37) % 100}%`,
              "--delay": `${(index * 0.17) % 5}s`,
              "--duration": `${3 + (index % 5)}s`,
              "--color": [
                "#ffda44",
                "#ffffff",
                "#63c8ff",
                "#f7a8df",
              ][index % 4],
            }}
          />
        ))}
      </div>

      <div className="nova-finale-content">
        <div className="nova-finale-badge">
          MISSION // COMPLETED
        </div>

        <div className="nova-finale-symbol">✦</div>

        <h1>مهمة مكتملة!</h1>

        <p className="nova-finale-subtitle">
          لقد نجحت في استعادة بيانات مدينة NOVA
          <br />
          وإعادة تشغيل النظام بنجاح.
        </p>

        <div className="nova-detective-card" ref={cardRef}>
          <div className="nova-card-top">
            <span>DATA//404</span>
            <span>OFFICIAL DETECTIVE ID</span>
          </div>

          <div className="nova-card-seal">✦</div>

          <p className="nova-card-label">بطاقة المحقق</p>

          <h2 className="nova-card-name">
            {player.name}
          </h2>

          <div className="nova-card-divider" />

          <div className="nova-card-rank-icon">
            {rank.icon}
          </div>

          <h3 className="nova-card-rank">
            {rank.title}
          </h3>

          <p className="nova-card-type">
            {rank.type}
          </p>

          <div className="nova-card-points">
            <span>مجموع النقاط</span>

            <strong>
              {points.toLocaleString("en-US")}
            </strong>

            <small> / 1000 PTS</small>
          </div>

          <div className="nova-card-bottom">
            <span>NOVA CITY // RESTORED</span>
            <span>✓ VERIFIED</span>
          </div>
        </div>

        <p className="nova-finale-message">
          شكرًا لمساهمتك في إنقاذ NOVA!
          <br />
          لقد أثبتّ أن وراء كل لغز عقلًا قادرًا على حله.
        </p>

        <div className="nova-finale-actions">
          <button
            type="button"
            className="nova-download-button"
            onClick={downloadCard}
            disabled={downloading}
          >
            {downloading
              ? "جارٍ تجهيز البطاقة..."
              : "📥 تحميل بطاقة المحقق"}
          </button>

          <button
            type="button"
            onClick={() =>
              setShowLeaderboard((value) => !value)
            }
          >
            {showLeaderboard
              ? "إخفاء لوحة الصدارة"
              : "🏆 عرض لوحة الصدارة"}
          </button>
        </div>

        {showLeaderboard && (
          <div
            className="nova-finale-leaderboard"
            ref={finaleLeaderboardRef}
          >
            <h3>LIVE LEADERBOARD</h3>

            <p>
              ترتيبك الحالي: #{position || "—"}
            </p>

            <ParticipantRows
              people={leaderboard}
              showPoints
            />
          </div>
        )}

        <div className="nova-finale-footer">
          PROGRAMMING CLUB × DATA//404
        </div>
      </div>
    </div>
  );
}

function App() {
  const puzzleRef = useRef(null);
  const stagesRef = useRef(null);
  const leaderboardRef = useRef(null);
  const participantsRef = useRef(null);

  // يتأكد من ظهور العنصر قبل الانتقال إليه
  function scrollToSection(ref) {
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        ref.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 120);
    });
  }

  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  const [name, setName] = useState("");
  const [registeredName, setRegisteredName] = useState("");

  const [participants, setParticipants] = useState([]);
  const [showParticipants, setShowParticipants] =
    useState(false);

  const [showLeaderboard, setShowLeaderboard] =
    useState(false);

  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const [game, setGame] = useState({
    status: "waiting",
  });

  const [adminMode, setAdminMode] = useState(
    window.location.hash === "#admin"
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [myPlayer, setMyPlayer] = useState(null);
  const [openStage, setOpenStage] = useState(null);

  const [answer, setAnswer] = useState("");
  const [stageMessage, setStageMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // يحدد هل نحتاج الرجوع لقائمة التحديات بعد نجاح الحل
  const pendingStageReturnRef = useRef(false);

  const isAdmin =
    !!user &&
    !user.isAnonymous &&
    user.uid === ADMIN_UID;

  const leaderboard = useMemo(
    () =>
      [...participants].sort(
        (a, b) =>
          (b.points || 0) - (a.points || 0) ||
          a.name.localeCompare(b.name, "ar")
      ),
    [participants]
  );

  useEffect(() => {
    const hashListener = () => {
      setAdminMode(
        window.location.hash === "#admin"
      );
    };

    window.addEventListener(
      "hashchange",
      hashListener
    );

    const unsubscribe = onAuthStateChanged(
      auth,
      async (currentUser) => {
        setUser(currentUser);
        setAuthReady(true);

        if (
          !currentUser &&
          window.location.hash !== "#admin"
        ) {
          try {
            await signInAnonymously(auth);
          } catch {
            setMessage(
              "تعذر الاتصال بخدمة التسجيل. يرجى التحقق من تفعيل Anonymous في Firebase Authentication."
            );
          }
        }
      }
    );

    return () => {
      unsubscribe();

      window.removeEventListener(
        "hashchange",
        hashListener
      );
    };
  }, []);

  // بعد إكمال المرحلة الخامسة: الانتقال لأعلى بطاقة المحقق
  useEffect(() => {
    if (
      myPlayer?.unlockedStage > 5 &&
      !adminMode
    ) {
      pendingStageReturnRef.current = false;

      window.requestAnimationFrame(() => {
        window.setTimeout(() => {
          window.scrollTo({
            top: 0,
            behavior: "smooth",
          });
        }, 120);
      });
    }
  }, [myPlayer?.unlockedStage, adminMode]);

  // عند اجتياز المراحل 1 إلى 4:
  // الرجوع لقائمة التحديات بعد تحديث التقدم
  useEffect(() => {
    if (!pendingStageReturnRef.current) return;

    if (
      !myPlayer ||
      myPlayer.unlockedStage > 5 ||
      adminMode
    ) {
      return;
    }

    pendingStageReturnRef.current = false;

    scrollToSection(stagesRef);
  }, [myPlayer?.unlockedStage, adminMode]);

  // عند فتح مرحلة: الانتقال إلى السؤال بعد ظهوره
  useEffect(() => {
    if (
      !openStage ||
      openStage !== myPlayer?.unlockedStage ||
      game.status !== "active"
    ) {
      return;
    }

    scrollToSection(puzzleRef);
  }, [
    openStage,
    myPlayer?.unlockedStage,
    game.status,
  ]);

  // الانتقال لقائمة المشاركين عند إظهارها
  useEffect(() => {
    if (showParticipants && !adminMode) {
      scrollToSection(participantsRef);
    }
  }, [showParticipants, adminMode]);

  // الانتقال للصدارة عند إظهارها
  useEffect(() => {
    if (showLeaderboard && !adminMode) {
      scrollToSection(leaderboardRef);
    }
  }, [showLeaderboard, adminMode]);

  useEffect(() => {
    if (!user || isAdmin) {
      setRegisteredName("");
      setMyPlayer(null);
      return;
    }

    return onSnapshot(
      doc(db, "players", user.uid),
      (snapshot) => {
        setRegisteredName(
          snapshot.exists()
            ? snapshot.data().name
            : ""
        );

        setMyPlayer(
          snapshot.exists()
            ? snapshot.data()
            : null
        );
      },
      () =>
        setMessage(
          "تعذر قراءة بيانات التسجيل. يرجى التحقق من قواعد Firestore."
        )
    );
  }, [user, isAdmin]);

  useEffect(() => {
    const unsubscribePlayers = onSnapshot(
      playersRef,
      (snapshot) => {
        setParticipants(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
      },
      () =>
        setMessage(
          "تعذر تحميل المشاركين. يرجى التحقق من نشر قواعد Firestore."
        )
    );

    const unsubscribeGame = onSnapshot(
      gameRef,
      (snapshot) => {
        setGame(
          snapshot.exists()
            ? snapshot.data()
            : { status: "waiting" }
        );
      },
      () =>
        setMessage(
          "تعذر قراءة حالة التحدي. يرجى التحقق من قواعد Firestore."
        )
    );

    return () => {
      unsubscribePlayers();
      unsubscribeGame();
    };
  }, []);

  async function registerParticipant(event) {
    event.preventDefault();

    const cleanName = name
      .trim()
      .replace(/\s+/g, " ");

    if (
      cleanName.length < 2 ||
      cleanName.length > 40
    ) {
      setMessage(
        "يجب أن يتكوّن الاسم من حرفين إلى 40 حرفًا."
      );
      return;
    }

    if (!user || !user.isAnonymous) {
      setMessage(
        "يرجى انتظار اتصال التسجيل، ثم إعادة المحاولة."
      );
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      await runTransaction(
        db,
        async (transaction) => {
          const ownRef = doc(
            db,
            "players",
            user.uid
          );

          const own = await transaction.get(
            ownRef
          );

          if (own.exists()) {
            throw new Error(
              "تم التسجيل بالفعل من هذا المتصفح."
            );
          }

          const nameRef = doc(
            db,
            "playerNames",
            cleanName.toLocaleLowerCase(
              "en-US"
            )
          );

          const reserved =
            await transaction.get(nameRef);

          if (reserved.exists()) {
            throw new Error(
              "هذا الاسم مسجل بالفعل."
            );
          }

          transaction.set(nameRef, {
            uid: user.uid,
          });

          transaction.set(ownRef, {
            name: cleanName,
            points: 0,
            unlockedStage: 1,
            stageStartActiveMs: 0,
            status: "READY",
            joinedAt: serverTimestamp(),
          });
        }
      );

      setName("");
    } catch (error) {
      console.error(error);

      if (
        error.message ===
          "هذا الاسم مسجل بالفعل." ||
        error.message ===
          "تم التسجيل بالفعل من هذا المتصفح."
      ) {
        setMessage(error.message);
      } else {
        setMessage(
          "تعذر التسجيل. يرجى التحقق من اتصال الإنترنت وقواعد Firestore."
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitStage(event) {
    event.preventDefault();

    if (
      !user?.isAnonymous ||
      !myPlayer ||
      game.status !== "active" ||
      !openStage
    ) {
      return;
    }

    const completedStage = openStage;

    const cleaned = answer
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");

    if (!cleaned) {
      setStageMessage(
        "يرجى كتابة الإجابة أولًا."
      );
      return;
    }

    setSubmitting(true);
    setStageMessage("");

    try {
      await runTransaction(db, async (tx) => {
        const playerRef = doc(
          db,
          "players",
          user.uid
        );

        const submissionRef = doc(
          db,
          "submissions",
          user.uid,
          "stages",
          String(completedStage)
        );

        const gameSnap = await tx.get(
          gameRef
        );

        const playerSnap = await tx.get(
          playerRef
        );

        const submissionSnap = await tx.get(
          submissionRef
        );

        if (!gameSnap.exists()) {
          throw new Error(
            "لم يبدأ التحدي بعد."
          );
        }

        const currentGame =
          gameSnap.data();

        if (
          currentGame.status !== "active"
        ) {
          throw new Error(
            "التحدي متوقف حاليًا."
          );
        }

        if (!playerSnap.exists()) {
          throw new Error(
            "تعذر العثور على بيانات التسجيل."
          );
        }

        const current =
          playerSnap.data();

        if (
          current.unlockedStage !==
          completedStage
        ) {
          throw new Error(
            "هذه المرحلة لم تعد متاحة. يرجى تحديث الصفحة."
          );
        }

        if (submissionSnap.exists()) {
          throw new Error(
            "تم اجتياز هذه المرحلة بالفعل."
          );
        }

        // نظام المؤقت والنقاط السابق دون تغيير
        const activeElapsedMs =
          getActiveElapsedMs(
            currentGame
          );

        const stageStartActiveMs =
          current.stageStartActiveMs ?? 0;

        const stageElapsedMs = Math.max(
          0,
          activeElapsedMs -
            stageStartActiveMs
        );

        const earnedPoints =
          calculateStagePoints(
            stageElapsedMs
          );

        const totalPoints =
          (current.points || 0) +
          earnedPoints;

        tx.set(submissionRef, {
          stage: completedStage,
          answer: cleaned,
          earnedPoints,
          submittedAt:
            serverTimestamp(),
        });

        tx.update(playerRef, {
          unlockedStage:
            completedStage + 1,
          points: totalPoints,
          stageStartActiveMs:
            activeElapsedMs,
        });
      });

      // الإجابة نجحت: إغلاق السؤال الحالي
      setAnswer("");
      setOpenStage(null);
      setStageMessage("");

      // المرحلة التالية يختارها المشارك بنفسه
      // لا نفتحها تلقائيًا
      if (completedStage < 5) {
        pendingStageReturnRef.current = true;

        // في حال وصل تحديث Firestore قبل انتهاء المعاملة
        // ننتقل بعد تحديث الواجهة
        window.setTimeout(() => {
          if (
            pendingStageReturnRef.current
          ) {
            pendingStageReturnRef.current = false;
            scrollToSection(stagesRef);
          }
        }, 250);
      } else {
        pendingStageReturnRef.current = false;

        window.setTimeout(() => {
          window.scrollTo({
            top: 0,
            behavior: "smooth",
          });
        }, 150);
      }
    } catch (error) {
      console.error(error);

      setStageMessage(
        error.code ===
          "permission-denied"
          ? "الإجابة غير صحيحة أو التحدي متوقف. يرجى مراجعة الحل والمحاولة مجددًا."
          : error.message ||
              "تعذر إرسال الإجابة. يرجى المحاولة مجددًا."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function loginAdmin(event) {
    event.preventDefault();

    setBusy(true);
    setMessage("");

    try {
      const result =
        await signInWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );

      if (
        result.user.uid !== ADMIN_UID
      ) {
        await signOut(auth);

        throw new Error(
          "هذا الحساب ليس حساب الإدارة المعتمد."
        );
      }

      setPassword("");
    } catch (error) {
      setMessage(
        error.message ===
          "هذا الحساب ليس حساب الإدارة المعتمد."
          ? error.message
          : "تعذر تسجيل دخول الإدارة. يرجى التحقق من البريد الإلكتروني وكلمة المرور."
      );
    } finally {
      setBusy(false);
    }
  }

  // التحكم السابق في المؤقت وحالة المسابقة
  async function changeStatus(status) {
    if (!isAdmin) return;

    setBusy(true);
    setMessage("");

    try {
      await runTransaction(
        db,
        async (tx) => {
          const snapshot =
            await tx.get(gameRef);

          const current =
            snapshot.exists()
              ? snapshot.data()
              : {
                  status: "waiting",
                };

          const previousStatus =
            current.status;

          const now = Date.now();

          let accumulatedActiveMs =
            current.accumulatedActiveMs ??
            0;

          const resumedAt =
            timestampMs(
              current.resumedAt
            );

          if (
            previousStatus ===
              "active" &&
            resumedAt
          ) {
            accumulatedActiveMs +=
              Math.max(
                0,
                now - resumedAt
              );
          }

          if (
            status === "waiting"
          ) {
            tx.set(gameRef, {
              status: "waiting",
              accumulatedActiveMs: 0,
              resumedAt: null,
              updatedAt:
                serverTimestamp(),
            });

            return;
          }

          if (
            status === "active" &&
            previousStatus ===
              "waiting"
          ) {
            tx.set(gameRef, {
              status: "active",
              accumulatedActiveMs: 0,
              resumedAt:
                serverTimestamp(),
              updatedAt:
                serverTimestamp(),
            });

            return;
          }

          if (
            status === "active" &&
            previousStatus ===
              "paused"
          ) {
            tx.set(
              gameRef,
              {
                status: "active",
                accumulatedActiveMs,
                resumedAt:
                  serverTimestamp(),
                updatedAt:
                  serverTimestamp(),
              },
              {
                merge: true,
              }
            );

            return;
          }

          tx.set(
            gameRef,
            {
              status,
              accumulatedActiveMs,
              resumedAt: null,
              updatedAt:
                serverTimestamp(),
            },
            {
              merge: true,
            }
          );
        }
      );
    } catch (error) {
      console.error(error);

      setMessage(
        "تعذر تغيير حالة التحدي. يرجى التحقق من صلاحيات الإدارة."
      );
    } finally {
      setBusy(false);
    }
  }

  async function leaveAdmin() {
    window.location.hash = "";
    await signOut(auth);
  }

  const statusLabel =
    game.status === "active"
      ? "التحدي جارٍ"
      : game.status === "paused"
      ? "التحدي متوقف مؤقتًا"
      : game.status === "finished"
      ? "انتهى التحدي"
      : "بانتظار إشارة بدء التحدي من الإدارة...";

  return (
    <div className="app-shell">
      <div className="background-glow" />

      <header className="site-header">
        <img
          src="/club-logo.png"
          alt="نادي البرمجة"
          className="club-logo"
        />

        <div className="system-status">
          <span className="status-text">
            NOVA // SYSTEM ONLINE
          </span>

          <span className="status-dot" />
        </div>
      </header>

      <main>
        {!adminMode &&
        myPlayer?.unlockedStage > 5 ? (
          <FinalePage
            player={myPlayer}
            leaderboard={leaderboard}
          />
        ) : adminMode ? (
          <section
            className="registration-section admin-section"
            dir="rtl"
          >
            <div className="registration-heading">
              <span>
                CONTROL // ADMIN
              </span>

              <span>DATA//404</span>
            </div>

            <h2>
              لوحة إدارة NOVA
            </h2>

            {!isAdmin ? (
              <form
                className="registration-form"
                onSubmit={loginAdmin}
              >
                <p>
                  الدخول مخصص لإدارة
                  التحدي فقط.
                </p>

                <label htmlFor="admin-email">
                  البريد الإلكتروني
                </label>

                <input
                  id="admin-email"
                  type="email"
                  value={email}
                  onChange={(e) =>
                    setEmail(
                      e.target.value
                    )
                  }
                  required
                  autoComplete="username"
                />

                <label
                  htmlFor="admin-password"
                  className="field-label"
                >
                  كلمة المرور
                </label>

                <input
                  id="admin-password"
                  type="password"
                  value={password}
                  onChange={(e) =>
                    setPassword(
                      e.target.value
                    )
                  }
                  required
                  autoComplete="current-password"
                />

                <button
                  className="primary-button"
                  type="submit"
                  disabled={busy}
                >
                  <span>
                    {busy
                      ? "جارٍ الدخول..."
                      : "دخول الإدارة"}
                  </span>

                  <span>←</span>
                </button>
              </form>
            ) : (
              <div className="admin-controls">
                <p className="admin-summary">
                  حالة النظام:{" "}
                  <strong>
                    {statusLabel}
                  </strong>
                </p>

                <p className="admin-summary">
                  عدد المحققين المسجلين:{" "}
                  <strong>
                    {participants.length}
                  </strong>
                </p>

                <div className="admin-actions">
                  <button
                    type="button"
                    disabled={
                      busy ||
                      game.status ===
                        "active"
                    }
                    onClick={() =>
                      changeStatus(
                        "active"
                      )
                    }
                  >
                    ▶ بدء / استئناف
                  </button>

                  <button
                    type="button"
                    disabled={
                      busy ||
                      game.status !==
                        "active"
                    }
                    onClick={() =>
                      changeStatus(
                        "paused"
                      )
                    }
                  >
                    Ⅱ إيقاف مؤقت
                  </button>

                  <button
                    type="button"
                    disabled={
                      busy ||
                      game.status ===
                        "finished"
                    }
                    onClick={() =>
                      changeStatus(
                        "finished"
                      )
                    }
                  >
                    ■ إنهاء التحدي
                  </button>

                  <button
                    type="button"
                    disabled={
                      busy ||
                      game.status ===
                        "waiting"
                    }
                    onClick={() =>
                      changeStatus(
                        "waiting"
                      )
                    }
                  >
                    ↻ إعادة الانتظار
                  </button>
                </div>

                <h3>
                  المحققون المسجلون
                </h3>

                <div className="participants-panel">
                  <ParticipantRows
                    people={participants}
                  />
                </div>

                <h3>
                  لوحة الصدارة
                </h3>

                <div className="participants-panel">
                  <ParticipantRows
                    people={leaderboard}
                    showPoints
                  />
                </div>

                <button
                  type="button"
                  className="secondary-button"
                  onClick={leaveAdmin}
                >
                  تسجيل الخروج من الإدارة
                </button>
              </div>
            )}

            {message && (
              <p
                className="form-message"
                role="alert"
              >
                {message}
              </p>
            )}

            <a
              className="back-link"
              href="#"
            >
              ← العودة للموقع
            </a>
          </section>
        ) : (
          <>
            <section className="hero-section">
              <div className="hero-layout">
                <div
                  className="hero-text"
                  dir="rtl"
                >
                  <div className="hero-top">
                    <p className="hero-intro">
                      مدينة NOVA تبحث عن
                      محققها القادم!
                    </p>

                    <h1
                      className="hero-title"
                      dir="ltr"
                    >
                      <span>
                        DATA
                      </span>

                      <strong>
                        //404
                      </strong>
                    </h1>

                    <div className="hero-badge">
                      مهمة استعادة البيانات
                    </div>
                  </div>

                  <div className="hero-bottom">
                    <p className="hero-description">
                      في مدينة NOVA، حدث
                      خلل غامض قلب نظامها
                      رأسًا على عقب.
                      اختلطت البيانات،
                      تعطلت الخوارزميات،
                      وأصبحت القرارات
                      غير منطقية.
                    </p>

                    <h2 className="hero-question">
                      هل أنت مستعد لكشف
                      الخلل وإعادة تشغيل
                      المدينة؟
                    </h2>
                  </div>
                </div>

                <div className="hero-visual">
                  <div className="detective-glow" />

                  <div className="detective-mask">
                    <img
                      src="/nova-detective.png"
                      alt="محقق بيانات مدينة NOVA"
                      className="detective-image"
                    />
                  </div>

                  <span className="floating-code code-1">
                    {"{ }"}
                  </span>

                  <span className="floating-code code-2">
                    0101
                  </span>

                  <span className="floating-code code-3">
                    NOVA
                  </span>

                  <span className="floating-code code-4">
                    {"</>"}
                  </span>

                  <span className="floating-code code-5">
                    HELP
                  </span>

                  <span className="floating-code code-6">
                    ERROR_404
                  </span>

                  <span className="floating-code code-7">
                    101101
                  </span>

                  <span className="floating-code code-8">
                    {"[ ]"}
                  </span>
                </div>
              </div>
            </section>

            <section
              className="story-section"
              dir="rtl"
            >
              <div className="story-label">
                THE MISSION // 001
              </div>

              <p>
                البيانات هي مفتاح نجاة NOVA.
                سجّل اسمك وانضم إلى فريق
                المحققين، واستعد لإشارة بدء
                المهمة.
              </p>
            </section>

            <section
              className="registration-section"
              dir="rtl"
            >
              <div className="registration-heading">
                <span className="section-number">
                  01 / 03
                </span>

                <span className="section-english">
                  IDENTITY VERIFICATION
                </span>
              </div>

              {!registeredName ? (
                <form
                  className="registration-form"
                  onSubmit={
                    registerParticipant
                  }
                >
                  <h2>
                    تسجيل المحققين
                  </h2>

                  <p>
                    سجّل اسمك لتكون ضمن
                    المشاركين في مهمة
                    استعادة البيانات.
                  </p>

                  <label htmlFor="participant-name">
                    اسم المشارك
                  </label>

                  <input
                    id="participant-name"
                    type="text"
                    value={name}
                    maxLength={40}
                    onChange={(e) => {
                      setName(
                        e.target.value
                      );

                      setMessage("");
                    }}
                    placeholder="اكتب اسمك هنا..."
                    autoComplete="name"
                  />

                  {message && (
                    <p
                      className="form-message"
                      role="alert"
                    >
                      {message}
                    </p>
                  )}

                  <button
                    className="primary-button"
                    type="submit"
                    disabled={
                      !authReady ||
                      busy ||
                      !user
                    }
                  >
                    <span>
                      {busy
                        ? "جارٍ التسجيل..."
                        : "تأكيد التسجيل"}
                    </span>

                    <span className="button-arrow">
                      ←
                    </span>
                  </button>
                </form>
              ) : (
                <div className="registration-success">
                  <div className="success-icon">
                    ✓
                  </div>

                  <h2>
                    تم تسجيلك بنجاح!
                  </h2>

                  <p>
                    مرحبًا{" "}
                    {registeredName}{" "}
                    في نظام NOVA
                  </p>

                  {game.status ===
                  "active" ? (
                    <div className="mission-launch">
                      <h3>
                        🚨 بدأت المهمة!
                      </h3>

                      <p>
                        تم تفعيل نظام
                        التحديات. يمكنك
                        الآن البدء في
                        حل المراحل.
                      </p>

                      {/* قائمة التحديات */}
                      <div ref={stagesRef}>
                        <StageList
                          unlockedStage={
                            myPlayer?.unlockedStage ||
                            1
                          }
                          onOpen={(number) => {
                            setOpenStage(
                              number
                            );

                            setAnswer("");
                            setStageMessage("");

                            // الانتقال للسؤال يتم
                            // تلقائيًا بعد ظهوره
                          }}
                        />
                      </div>

                      {myPlayer?.unlockedStage >
                      5 ? (
                        <p className="stage-complete">
                          🏆 أحسنت! تمت
                          استعادة نظام NOVA
                          وإكمال جميع المراحل
                          بنجاح.
                        </p>
                      ) : null}

                      {openStage &&
                        openStage ===
                          myPlayer?.unlockedStage && (
                          <form
                            className="puzzle-panel"
                            ref={puzzleRef}
                            onSubmit={
                              submitStage
                            }
                            dir="rtl"
                          >
                            <div className="puzzle-kicker">
                              NOVA // CHALLENGE{" "}
                              {String(
                                openStage
                              ).padStart(
                                2,
                                "0"
                              )}
                            </div>

                            <h4>
                              {
                                STAGES[
                                  openStage -
                                    1
                                ].title
                              }
                            </h4>

                            <p>
                              {
                                STAGES[
                                  openStage -
                                    1
                                ].question
                              }
                            </p>

                            <pre
                              className="puzzle-code"
                              dir="ltr"
                            >
                              {
                                STAGES[
                                  openStage -
                                    1
                                ].code
                              }
                            </pre>

                            <label htmlFor="stage-answer">
                              الإجابة
                            </label>

                            <input
                              id="stage-answer"
                              type="text"
                              value={answer}
                              onChange={(e) =>
                                setAnswer(
                                  e.target.value
                                )
                              }
                              placeholder={
                                STAGES[
                                  openStage -
                                    1
                                ].placeholder
                              }
                              autoComplete="off"
                              maxLength={80}
                            />

                            {stageMessage && (
                              <p
                                className="form-message"
                                role="alert"
                              >
                                {stageMessage}
                              </p>
                            )}

                            <button
                              className="primary-button"
                              type="submit"
                              disabled={
                                submitting ||
                                game.status !==
                                  "active"
                              }
                            >
                              <span>
                                {submitting
                                  ? "جارٍ التحقق..."
                                  : "إرسال الإجابة والتحقق"}
                              </span>

                              <span className="button-arrow">
                                ←
                              </span>
                            </button>
                          </form>
                        )}
                    </div>
                  ) : game.status ===
                    "finished" ? (
                    <div className="waiting-status">
                      انتهى التحدي. يمكن
                      متابعة لوحة الصدارة
                      لمعرفة النتائج.
                    </div>
                  ) : (
                    <div className="waiting-status">
                      <span className="status-dot" />
                      {statusLabel}
                    </div>
                  )}
                </div>
              )}

              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setShowParticipants(
                    (value) => !value
                  );
                }}
              >
                {showParticipants
                  ? "إخفاء المشاركين"
                  : `عرض المحققين المسجلين (${participants.length})`}
              </button>

              {showParticipants && (
                <div
                  className="participants-panel"
                  ref={participantsRef}
                >
                  <h3>
                    REGISTERED OPERATORS
                  </h3>

                  <ParticipantRows
                    people={participants}
                  />
                </div>
              )}

              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setShowLeaderboard(
                    (value) => !value
                  );
                }}
              >
                {showLeaderboard
                  ? "إخفاء لوحة الصدارة"
                  : "عرض لوحة الصدارة 🏆"}
              </button>

              {showLeaderboard && (
                <div
                  className="participants-panel"
                  ref={leaderboardRef}
                >
                  <h3>
                    LIVE LEADERBOARD
                  </h3>

                  <ParticipantRows
                    people={leaderboard}
                    showPoints
                  />
                </div>
              )}
            </section>
          </>
        )}
      </main>

      <footer className="site-footer">
        DATA//404 © PROGRAMMING CLUB
      </footer>
    </div>
  );
}

function ParticipantRows({
  people,
  showPoints = false,
}) {
  if (!people.length) {
    return (
      <p className="empty-message">
        لا يوجد مشاركون حتى الآن.
      </p>
    );
  }

  return (
    <div className="participants-list">
      {people.map((person, index) => (
        <div
          className="participant-row"
          key={person.id}
        >
          <span className="participant-rank">
            #
            {String(index + 1).padStart(
              2,
              "0"
            )}
          </span>

          <span className="participant-name">
            {person.name}
          </span>

          <span className="participant-ready">
            {showPoints
              ? `${person.points || 0} PTS`
              : "READY"}
          </span>
        </div>
      ))}
    </div>
  );
}

function StageList({
  unlockedStage,
  onOpen,
}) {
  return (
    <div className="stage-list">
      {STAGES.map((stage, index) => {
        const number = index + 1;

        const completed =
          number < unlockedStage;

        const available =
          number === unlockedStage;

        return (
          <button
            type="button"
            className={`stage-row stage-button ${
              completed
                ? "stage-done"
                : ""
            }`}
            key={stage.title}
            disabled={!available}
            onClick={() =>
              onOpen(number)
            }
          >
            <span>
              {completed
                ? "✓"
                : available
                ? "◉"
                : "🔒"}{" "}
              {String(number).padStart(
                2,
                "0"
              )}{" "}
              — {stage.title}
            </span>

            <small>
              {completed
                ? "مكتملة"
                : `${stage.points} PTS`}
            </small>
          </button>
        );
      })}
    </div>
  );
}

export default App;