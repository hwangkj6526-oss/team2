"use client";

import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db, ensureFirebaseUser } from "./firebase";

type Rating = "helpful" | "okay" | "notHelpful";
type CloudStatus = "connecting" | "connected" | "syncing" | "offline";
type R = {
  id: string;
  s: string;
  i: string;
  g: string;
  t: string[];
  rating?: Rating;
};

const K = "malmoon";
const TRASH_K = "malmoon-trash";

const situationOptions = [
  "새 학기, 새 짝을 만났을 때",
  "점심시간에 혼자 있는 친구에게 말 걸 때",
  "처음 동아리 모임에 갔을 때",
  "친구의 친구를 처음 소개받았을 때",
  "쉬는 시간에 옆자리 친구와 이야기할 때",
  "새로 전학 온 친구에게 다가갈 때",
  "온라인에서만 알던 친구를 처음 만났을 때",
  "같은 모둠 친구와 처음 과제를 시작할 때",
  "오랜만에 만난 친구와 다시 이야기할 때",
  "버스나 학원에서 자주 마주치는 친구에게 말 걸 때",
];

const interestOptions = [
  "게임",
  "애니메이션",
  "영화·드라마",
  "유튜브",
  "음악",
  "스포츠",
  "웹툰·만화",
  "책",
  "공부·진로",
  "반려동물",
  "패션·뷰티",
  "맛집·카페",
];

const goalOptions = [
  "조금 더 친해지기",
  "어색함 풀기",
  "서로 더 알아가기",
  "자연스럽게 인사하는 사이 되기",
  "다음에도 대화 이어가기",
  "같이 점심 먹기",
  "연락처나 SNS 물어보기",
  "함께 할 취미 찾기",
  "같이 할 일 찾기",
  "고민을 편하게 나누는 사이 되기",
];

const ratingOptions: { value: Rating; icon: string; label: string }[] = [
  { value: "helpful", icon: "👍", label: "도움됐어요" },
  { value: "okay", icon: "🤔", label: "조금 애매해요" },
  { value: "notHelpful", icon: "💡", label: "아쉬워요" },
];

export default function App() {
  const [v, setV] = useState("home");
  const [d, setD] = useState<R[]>([]);
  const [trash, setTrash] = useState<R[]>([]);
  const [x, setX] = useState<R | null>(null);
  const [f, setF] = useState({ s: "", i: "", g: "" });
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [customInterest, setCustomInterest] = useState("");
  const [e, setE] = useState("");
  const [q, setQ] = useState("");
  const [firebaseUid, setFirebaseUid] = useState<string | null>(null);
  const [cloudStatus, setCloudStatus] =
    useState<CloudStatus>("connecting");

  useEffect(() => {
    let cancelled = false;
    let localRecords: R[] = [];
    let localTrash: R[] = [];

    try {
      localRecords = JSON.parse(localStorage.getItem(K) || "[]");
      localTrash = JSON.parse(localStorage.getItem(TRASH_K) || "[]");
      setD(localRecords);
      setTrash(localTrash);
    } catch {
      setE("기록을 불러오지 못했어요.");
    }

    const loadFirebaseRecords = async () => {
      try {
        const user = await ensureFirebaseUser();
        if (cancelled) return;

        setFirebaseUid(user.uid);
        const recordsRef = collection(db, "users", user.uid, "records");
        const trashRef = collection(db, "users", user.uid, "trash");
        const [recordsSnapshot, trashSnapshot] = await Promise.all([
          getDocs(query(recordsRef, orderBy("createdAt", "desc"))),
          getDocs(query(trashRef, orderBy("deletedAt", "desc"))),
        ]);
        const toRecord = (record: (typeof recordsSnapshot.docs)[number]) => {
          const { createdAt, deletedAt, ...recordData } = record.data();
          void createdAt;
          void deletedAt;
          return { id: record.id, ...(recordData as Omit<R, "id">) };
        };
        let cloudRecords = recordsSnapshot.docs.map(toRecord);
        let cloudTrash = trashSnapshot.docs.map(toRecord);

        if (!cloudRecords.length && localRecords.length) {
          await Promise.all(
            localRecords.map((record) => {
              const { id, ...recordData } = record;
              return setDoc(doc(recordsRef, id), {
                ...recordData,
                createdAt: serverTimestamp(),
              });
            }),
          );
          cloudRecords = localRecords;
        }

        if (!cloudTrash.length && localTrash.length) {
          await Promise.all(
            localTrash.map((record) => {
              const { id, ...recordData } = record;
              return setDoc(doc(trashRef, id), {
                ...recordData,
                deletedAt: serverTimestamp(),
              });
            }),
          );
          cloudTrash = localTrash;
        }

        if (!cancelled) {
          setD(cloudRecords);
          setTrash(cloudTrash);
          localStorage.setItem(K, JSON.stringify(cloudRecords));
          localStorage.setItem(TRASH_K, JSON.stringify(cloudTrash));
          setCloudStatus("connected");
        }
      } catch {
        if (!cancelled) setCloudStatus("offline");
      }
    };

    void loadFirebaseRecords();
    return () => {
      cancelled = true;
    };
  }, []);

  const syncInterests = (interests: string[], custom = customInterest) => {
    const allInterests = [...interests, custom.trim()].filter(Boolean);
    setF((current) => ({ ...current, i: allInterests.join(", ") }));
  };

  const toggleInterest = (interest: string) => {
    const next = selectedInterests.includes(interest)
      ? selectedInterests.filter((item) => item !== interest)
      : [...selectedInterests, interest];

    setSelectedInterests(next);
    syncInterests(next);
    setE("");
  };

  const make = () => {
    if (!f.s || !f.i || !f.g) {
      setE("상황, 관심사, 대화 목표를 모두 선택해 주세요.");
      return;
    }

    const n = {
      id: crypto.randomUUID(),
      ...f,
      t: [
        `${f.i} 이야기 꺼내기`,
        "서로의 공통점 찾아보기",
        `${f.g}로 이어가기`,
      ],
    };
    setX(n);
    setE("");
    setV("result");
  };

  const saveRecord = async () => {
    if (!x) return;

    const alreadySaved = d.some((item) => item.id === x.id);
    const next = alreadySaved
      ? d.map((item) => (item.id === x.id ? x : item))
      : [x, ...d];
    localStorage.setItem(K, JSON.stringify(next));
    setD(next);

    if (!firebaseUid) {
      setCloudStatus("offline");
      return;
    }

    try {
      setCloudStatus("syncing");
      const { id, ...recordData } = x;
      await setDoc(doc(db, "users", firebaseUid, "records", id), {
        ...recordData,
        createdAt: serverTimestamp(),
      });
      setCloudStatus("connected");
    } catch {
      setCloudStatus("offline");
    }
  };

  const deleteRecord = async (id: string) => {
    if (!window.confirm("이 기록을 휴지통으로 이동할까요? 나중에 복원할 수 있어요."))
      return;

    const deletedRecord = d.find((item) => item.id === id);
    if (!deletedRecord) return;

    const next = d.filter((item) => item.id !== id);
    const nextTrash = [
      deletedRecord,
      ...trash.filter((item) => item.id !== id),
    ];
    localStorage.setItem(K, JSON.stringify(next));
    localStorage.setItem(TRASH_K, JSON.stringify(nextTrash));
    setD(next);
    setTrash(nextTrash);

    if (!firebaseUid) {
      setCloudStatus("offline");
      return;
    }

    try {
      setCloudStatus("syncing");
      const { id: recordId, ...recordData } = deletedRecord;
      const batch = writeBatch(db);
      batch.set(doc(db, "users", firebaseUid, "trash", recordId), {
        ...recordData,
        deletedAt: serverTimestamp(),
      });
      batch.delete(doc(db, "users", firebaseUid, "records", recordId));
      await batch.commit();
      setCloudStatus("connected");
    } catch {
      setCloudStatus("offline");
    }
  };

  const restoreRecord = async (id: string) => {
    const restoredRecord = trash.find((item) => item.id === id);
    if (!restoredRecord) return;

    const next = [
      restoredRecord,
      ...d.filter((item) => item.id !== restoredRecord.id),
    ];
    const nextTrash = trash.filter((item) => item.id !== id);
    localStorage.setItem(K, JSON.stringify(next));
    localStorage.setItem(TRASH_K, JSON.stringify(nextTrash));
    setD(next);
    setTrash(nextTrash);

    if (!firebaseUid) {
      setCloudStatus("offline");
      return;
    }

    try {
      setCloudStatus("syncing");
      const { id: recordId, ...recordData } = restoredRecord;
      const batch = writeBatch(db);
      batch.set(doc(db, "users", firebaseUid, "records", recordId), {
        ...recordData,
        createdAt: serverTimestamp(),
      });
      batch.delete(doc(db, "users", firebaseUid, "trash", recordId));
      await batch.commit();
      setCloudStatus("connected");
    } catch {
      setCloudStatus("offline");
    }
  };

  const rateAdvice = async (rating: Rating) => {
    if (!x) return;

    const updated = { ...x, rating };
    setX(updated);

    if (d.some((item) => item.id === x.id)) {
      const next = d.map((item) => (item.id === x.id ? updated : item));
      localStorage.setItem(K, JSON.stringify(next));
      setD(next);

      if (!firebaseUid) {
        setCloudStatus("offline");
        return;
      }

      try {
        setCloudStatus("syncing");
        await updateDoc(
          doc(db, "users", firebaseUid, "records", x.id),
          { rating },
        );
        setCloudStatus("connected");
      } catch {
        setCloudStatus("offline");
      }
    }
  };

  const xp = d.length * 30;
  const level = Math.floor(xp / 100) + 1;
  const progress = xp % 100;

  return (
    <>
      <aside className="side-menu" aria-label="말문 주요 메뉴">
        <div className="side-menu-brand">
          <img src="/talkling-mascot.png" alt="" aria-hidden="true" />
          <div>
            <strong>말문:</strong>
            <span>대화 탐험 메뉴</span>
          </div>
        </div>
        <nav>
          <button
            className={v === "home" ? "active" : ""}
            aria-current={v === "home" ? "page" : undefined}
            onClick={() => setV("home")}
          >
            <span aria-hidden="true">⌂</span>
            <b>홈</b>
          </button>
          <button
            className={v === "form" || v === "result" ? "active" : ""}
            aria-current={
              v === "form" || v === "result" ? "page" : undefined
            }
            onClick={() => setV("form")}
          >
            <span aria-hidden="true">✦</span>
            <b>주제 만들기</b>
          </button>
          <button
            className={v === "history" ? "active" : ""}
            aria-current={v === "history" ? "page" : undefined}
            onClick={() => setV("history")}
          >
            <span aria-hidden="true">▤</span>
            <b>내 기록</b>
          </button>
        </nav>
        <div className={`cloud-status ${cloudStatus}`} role="status">
          <i />
          <span>
            {cloudStatus === "connecting"
              ? "Firebase 연결 중"
              : cloudStatus === "syncing"
                ? "기록 동기화 중"
                : cloudStatus === "connected"
                  ? "Firebase 저장"
                  : "로컬 백업 모드"}
          </span>
        </div>
      </aside>
      <main>
      <header>
        <button onClick={() => setV("home")}>말문:</button>
        <button onClick={() => setV("history")}>내 기록</button>
      </header>

      {v === "home" && (
        <section>
          <b>AI 대화 주제 추천</b>
          <h1>
            어색한 순간,
            <br />
            첫마디부터 같이 찾아요.
          </h1>
          <p>
            상황과 관심사를 알려주면 부담 없는 대화 주제와 예시 질문을 추천해
            드려요.
          </p>
          <div className="level-card">
            <img src="/talkling-mascot.png" alt="대화 탐험가 마스코트" />
            <div>
              <span>대화 탐험가 · LV.{level}</span>
              <strong>{xp} XP</strong>
              <div className="xp-track">
                <i style={{ width: `${progress}%` }} />
              </div>
              <small>다음 레벨까지 {100 - progress} XP</small>
            </div>
          </div>
          <div className="hero-art">
            <img
              src="/conversation-cosmic-scene.png"
              alt="대화를 시작하는 두 학생 일러스트"
            />
          </div>
          <button className="primary" onClick={() => setV("form")}>
            대화 주제 만들기 →
          </button>
          <h2>이런 주제를 추천해요</h2>
          <div className="cards">
            {["오늘 가장 웃겼던 순간", "요즘 빠진 것", "주말 소소한 계획"].map(
              (item) => (
                <article key={item}>
                  ✦<h3>{item}</h3>
                  <p>가벼운 질문으로 자연스럽게 시작해요.</p>
                </article>
              ),
            )}
          </div>
        </section>
      )}

      {v === "form" && (
        <section className="form-page">
          <button onClick={() => setV("home")}>← 돌아가기</button>
          <b>새 대화 주제</b>
          <h1>
            누구와, 어떤 이야기를
            <br />
            시작해 볼까요?
          </h1>

          <fieldset className="form-block">
            <legend>1. 지금 어떤 상황인가요?</legend>
            <p className="form-helper">가장 비슷한 상황 하나를 골라 주세요.</p>
            <div className="choice-grid situations">
              {situationOptions.map((situation) => (
                <button
                  type="button"
                  className={`choice ${f.s === situation ? "selected" : ""}`}
                  aria-pressed={f.s === situation}
                  key={situation}
                  onClick={() => {
                    setF((current) => ({ ...current, s: situation }));
                    setE("");
                  }}
                >
                  {situation}
                </button>
              ))}
            </div>
            <label className="custom-field">
              기타 상황 직접 입력
              <input
                value={situationOptions.includes(f.s) ? "" : f.s}
                onChange={(event) => {
                  setF((current) => ({ ...current, s: event.target.value }));
                  setE("");
                }}
                placeholder="위에 없는 상황을 적어 주세요"
              />
            </label>
          </fieldset>

          <fieldset className="form-block">
            <legend>2. 나의 관심사나 좋아하는 것은?</legend>
            <p className="form-helper">여러 개 선택할 수 있어요.</p>
            <div className="choice-grid interests">
              {interestOptions.map((interest) => (
                <button
                  type="button"
                  className={`choice ${selectedInterests.includes(interest) ? "selected" : ""}`}
                  aria-pressed={selectedInterests.includes(interest)}
                  key={interest}
                  onClick={() => toggleInterest(interest)}
                >
                  {interest}
                </button>
              ))}
            </div>
            <label className="custom-field">
              기타 관심사 직접 입력
              <input
                value={customInterest}
                onChange={(event) => {
                  const custom = event.target.value;
                  setCustomInterest(custom);
                  syncInterests(selectedInterests, custom);
                  setE("");
                }}
                placeholder="예: 사진 찍기, 보드게임"
              />
            </label>
          </fieldset>

          <fieldset className="form-block">
            <legend>3. 대화 후 어떻게 되면 좋을까요?</legend>
            <p className="form-helper">이번 대화에서 바라는 목표를 골라 주세요.</p>
            <div className="choice-grid goals">
              {goalOptions.map((goal) => (
                <button
                  type="button"
                  className={`choice ${f.g === goal ? "selected" : ""}`}
                  aria-pressed={f.g === goal}
                  key={goal}
                  onClick={() => {
                    setF((current) => ({ ...current, g: goal }));
                    setE("");
                  }}
                >
                  {goal}
                </button>
              ))}
            </div>
          </fieldset>

          {e && (
            <small className="form-error" role="alert">
              {e}
            </small>
          )}
          <button className="primary" onClick={make}>
            대화 주제 추천받기
          </button>
        </section>
      )}

      {v === "result" && x && (
        <section>
          <button onClick={() => setV("history")}>← 내 기록</button>
          <b>추천이 완성됐어요</b>
          <h1>
            마음에 드는 말부터
            <br />
            꺼내 봐요.
          </h1>
          {x.t.map((item, index) => (
            <article className="topic" key={item}>
              <b>0{index + 1}</b>
              <h2>{item}</h2>
              <strong>
                “
                {index === 0
                  ? `${x.s}, ${x.i} 이야기를 꺼내 보면 어때?`
                  : index === 1
                    ? `나는 ${x.i}에 관심이 있는데, 너도 비슷한 거 좋아해?`
                    : `다음에 시간 괜찮으면 ${x.i} 관련해서 같이 이야기해 볼래?`}
                ”
              </strong>
              <p>부담 없이 상대의 이야기를 들어 보세요.</p>
            </article>
          ))}
          <div className="save-record-card">
            <div>
              <span>내 기록</span>
              <strong>
                {d.some((item) => item.id === x.id)
                  ? "이 추천을 저장했어요."
                  : "이 추천을 나중에 다시 볼까요?"}
              </strong>
              <p>저장하면 내 기록에서 언제든 다시 확인할 수 있어요.</p>
            </div>
            <button
              type="button"
              className={d.some((item) => item.id === x.id) ? "saved" : ""}
              disabled={d.some((item) => item.id === x.id)}
              onClick={saveRecord}
            >
              {d.some((item) => item.id === x.id)
                ? "✓ 저장됨"
                : "내 기록에 저장"}
            </button>
          </div>
          <div className="feedback-card">
            <span className="feedback-kicker">추천 평가</span>
            <h2>이 조언이 도움이 됐나요?</h2>
            <p>느낌에 가장 가까운 평가를 골라 주세요.</p>
            <div
              className="rating-options"
              role="group"
              aria-label="추천 조언 평가"
            >
              {ratingOptions.map((rating) => (
                <button
                  type="button"
                  className={`rating-button ${x.rating === rating.value ? "selected" : ""}`}
                  aria-pressed={x.rating === rating.value}
                  key={rating.value}
                  onClick={() => rateAdvice(rating.value)}
                >
                  <span aria-hidden="true">{rating.icon}</span>
                  {rating.label}
                </button>
              ))}
            </div>
            {x.rating && (
              <div className="feedback-saved" role="status">
                ✓ 평가가 기록에 저장됐어요.
              </div>
            )}
          </div>
          <button className="primary" onClick={() => setV("form")}>
            새 주제 만들기
          </button>
        </section>
      )}

      {v === "history" && (
        <section>
          <button onClick={() => setV("home")}>← 홈으로</button>
          <b>내 기록</b>
          <h1>
            전에 만든 주제를
            <br />
            다시 확인해요.
          </h1>
          <input
            placeholder="상황이나 관심사로 찾아보기"
            onChange={(event) => setQ(event.target.value)}
          />
          {d.filter((item) => (item.s + item.i + item.g).includes(q)).length ? (
            d
              .filter((item) => (item.s + item.i + item.g).includes(q))
              .map((item) => (
                <article className="item" key={item.id}>
                  <button
                    className="item-open"
                    onClick={() => {
                      setX(item);
                      setV("result");
                    }}
                  >
                    <span className="item-heading">
                      <strong>{item.s}</strong>
                      {item.rating && (
                        <span className="history-rating">
                          {
                            ratingOptions.find(
                              (rating) => rating.value === item.rating,
                            )?.icon
                          }{" "}
                          {
                            ratingOptions.find(
                              (rating) => rating.value === item.rating,
                            )?.label
                          }
                        </span>
                      )}
                    </span>
                    <p>
                      {item.i} · {item.g}
                    </p>
                    <b>추천 보기 →</b>
                  </button>
                  <div className="item-actions">
                    <span>✓ 저장된 기록</span>
                    <button
                      type="button"
                      className="delete-record"
                      onClick={() => deleteRecord(item.id)}
                      aria-label={`${item.s} 기록 삭제`}
                    >
                      기록 삭제
                    </button>
                  </div>
                </article>
              ))
          ) : (
            <div className="state">
              아직 만든 주제가 없어요.
              <button onClick={() => setV("form")}>대화 주제 만들기</button>
            </div>
          )}
          {trash.length > 0 && (
            <div className="trash-panel">
              <div className="trash-heading">
                <div>
                  <span>휴지통</span>
                  <h2>최근 삭제한 기록</h2>
                </div>
                <b>{trash.length}개</b>
              </div>
              <p>잘못 삭제한 기록을 원래 목록으로 되돌릴 수 있어요.</p>
              <div className="trash-list">
                {trash.map((item) => (
                  <article className="trash-item" key={item.id}>
                    <div>
                      <strong>{item.s}</strong>
                      <p>
                        {item.i} · {item.g}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => restoreRecord(item.id)}
                    >
                      ↶ 복원
                    </button>
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
      </main>
    </>
  );
}
