<script>
  /** @type {{ onExit?: () => void }} */
  let { onExit = () => {} } = $props();

  const suspects = [
    { id: 'dae', name: '최대리', details: '박대리와 함께 진급시험을 봤다가 밀려난 동료. 야근 후 22:30 귀가했다고 진술했다.' },
    { id: 'bu', name: '오부장', details: '덕일상사 부장. 18:00에 퇴근했고, 박대리와는 업무 관계였다고 말한다.' },
    { id: 'sa', name: '최사원', details: '박대리와 사귄다는 소문이 돌던 친한 후배. 21:00에 야근을 마쳤다고 한다.' },
    { id: 'gwa', name: '서과장', details: '박대리와 같은 부서의 상사. 19:00에 퇴근했다고 진술했다.' },
  ];

  const evidence = /** @type {Record<string, { icon: string, name: string, place: string, detail: string }>} */ ({
    e1: { icon: '🍜', name: '컵라면 용기', place: '탕비실', detail: '바닥의 용기. 스프 잔여물에서만 독이 검출됐다.' },
    e2: { icon: '📦', name: '이름표 컵라면', place: '탕비실', detail: '선반 위 박대리 이름표가 붙은 컵라면. 포장을 다시 붙인 흔적이 있다.' },
    e3: { icon: '🧤', name: '장갑과 약병 라벨', place: '탕비실', detail: '쓰레기통에서 발견한 일회용 장갑과 약병 라벨 조각. 립밤 향이 난다.' },
    e4: { icon: '💊', name: '영양제 병', place: '박대리 책상', detail: '박대리 서랍에서 발견. 오부장의 지문과 독이 묻어 있지만 컵라면의 독과 성분이 다르다.' },
    e5: { icon: '📱', name: '복원된 메시지', place: '박대리 책상', detail: '삭제된 메시지: “오늘은 야식 먹지 말고 그냥 퇴근해.” 발신자는 최사원.' },
    e6: { icon: '🪜', name: '계단 장갑·출입기록', place: '비상계단', detail: '난간에서 장갑 한 짝과 22:20 비상계단 출입기록을 찾았다. 최대리의 물건이다.' },
    e7: { icon: '🪪', name: '출입카드 기록', place: '경비실', detail: '서과장이 22:40에 사무실로 다시 들어온 기록.' },
    e8: { icon: '📋', name: '감식 보고서', place: '경비실', detail: '사인은 컵라면 스프의 독. 영양제의 독과 성분이 다르다. 사망 시각은 23:00.' },
    e9: { icon: '🎙️', name: '협박 녹음·커터', place: '박대리 책상', detail: '박대리 PC에 서과장을 협박하는 녹음이 남아 있고, 책상 위에서 커터가 발견됐다.' },
  });

  const rooms = [
    { id: 'desk', name: '박대리 책상', evidence: ['e4', 'e5', 'e9'], mood: '기록과 개인 물건' },
    { id: 'pantry', name: '탕비실', evidence: ['e1', 'e2', 'e3'], mood: '야식이 놓여 있던 곳' },
    { id: 'stairs', name: '비상계단', evidence: ['e6'], mood: '누군가 기다렸던 곳' },
    { id: 'guard', name: '경비실', evidence: ['e7', 'e8'], mood: '출입 기록과 감식 결과' },
  ];

  const alibis = /** @type {Record<string, string[]>} */ ({
    dae: ['10시 반에 퇴근했습니다. 야근 중이었고요.', '동기일 뿐입니다. 진급은… 실력대로 된 거죠.'],
    bu: ['6시에 퇴근했네. 집에서 가족과 있었지.', '일 잘하는 부하였지. 그 이상은 없네.'],
    sa: ['9시쯤 야근 마치고 퇴근했어요.', '…친한 선후배예요. 소문일 뿐이에요.'],
    gwa: ['7시에 퇴근했어요. 그 뒤로는 오지 않았고요.', '같은 부서 상사로 가끔 밥 먹는 사이였죠.'],
  });

  const reactions = /** @type {Record<string, Record<string, string[]>>} */ ({
    dae: { e6: ['…맞아요. 22시 20분, 계단에서 기다렸어요. 죽이려 했죠. 근데 끝내 안 나왔어요. 독이요? 전 모릅니다.', true], e8: ['독이라고요…? 전 그렇게 치밀한 사람이 못 돼요.'] },
    bu: { e4: ['…내가 했네. 영양제에 손을 댔어. 딸을 가지고 논 놈이니까. 하지만 그걸 먹진 않았다고?', true], e8: ['성분이 다르다고? 그럼 내가 범인이 아니란 걸 자네는 아는군.'] },
    sa: { e1: ['스프에서 독이요…? 누가 미리 넣어둔 거네요.'], e2: ['포장이요? 원래 그런 거 아닌가요… 박대리님이 자주 사다 두셨어요.'], e3: ['제 거라는 증거 있어요? …아니, 몰라요!'], e8: ['사망이 11시면… 전 이미 퇴근했는데요?'], e5: ['…그걸 복원했어요?! 그건 걱정돼서 보낸 거예요. (손이 떨린다)'] },
    gwa: { e7: ['…맞아요, 22시 40분에 다시 왔어요. 협박당했거든요. 하지만 죽이진 않았어요.'], e9: ['그가 협박한 건 사실이에요. 하지만 제가 갔을 땐 컵라면에 물을 붓고 있었고, 말다툼 후 나왔어요. 그땐 멀쩡했어요!', true], e1: ['컵라면에 독이요? 제가 나올 땐 아직 먹기 전이었어요.'] },
  });

  const intro = [
    '덕일상사 빌딩, 새벽 0시 10분.',
    '순찰 중이던 경비가 탕비실 불을 끄러 갔다가 쓰러진 사람을 발견했다.',
    '피해자는 박대리. 입엔 거품, 오른손엔 젓가락, 다리엔 뜨거운 물에 데인 자국. 사망 추정 시각은 오후 11시.',
    '인망 좋던 사원의 죽음. 용의자는 네 명. 탐정, 당신의 차례다.',
  ];

  const resolution = [
    '탐정은 최사원 앞에 증거를 하나씩 늘어놓았다.',
    '“9시에 퇴근했어요. 맞아요. 하지만 그 전에… 그 사람의 컵라면에 손을 댔어요.”',
    '오부장의 딸, 그리고 박대리의 거짓말. 배신감이 그녀를 무너뜨렸다.',
    '“말리고 싶어서 보냈다가 지웠어요. 먹지 않기를 바라면서도… 먹길 바랐어요.”',
    '새벽, 덕일상사 앞. 최사원은 경찰차에 올랐다. 사건 종결.',
  ];

  const hints = /** @type {Record<string, string[]>} */ ({
    explore: ['박대리 책상, 탕비실, 비상계단, 경비실을 모두 살펴봐.', '아직 조사하지 않은 증거가 있는 장소를 확인해.', '사망 시각과 퇴근 시각만으로 범인을 단정하지 마.'],
    alibi: ['서과장의 7시 퇴근 진술을 출입기록과 비교해 봐.', '독은 사망 시각에 넣었을 필요가 없어.', '다음 단계에서 증거를 보여주며 진술을 확인해.'],
    cross: ['영양제 병과 감식 보고서를 오부장에게 보여줘. 두 독은 달라.', '서과장에게 협박 녹음을 보여주면 사망 직전 박대리의 상태를 알 수 있어.', '컵라면 관련 증거와 복원된 메시지를 최사원에게 보여줘.'],
    accuse: ['범인은 퇴근한 뒤에도 범행이 가능했던 사람이야.', '컵라면 용기, 이름표 컵라면, 장갑·약병 라벨, 복원된 메시지가 핵심 증거야.', '박대리와 가장 가까웠던 사람의 말을 다시 떠올려 봐.'],
  });

  let phase = $state('title');
  let introIndex = $state(0);
  let roomId = $state('');
  /** @type {string[]} */
  let found = $state([]);
  let currentEvidence = $state('');
  let selectedSuspect = $state('');
  /** @type {{ text: string, source: string }[]} */
  let responses = $state([]);
  /** @type {string[]} */
  let accusation = $state([]);
  let resultMessage = $state('');
  let hintMessage = $state('');
  /** @type {Record<string, number>} */
  let hintIndex = $state({});

  let selectedRoom = $derived(rooms.find((room) => room.id === roomId));
  let selected = $derived(suspects.find((suspect) => suspect.id === selectedSuspect));

  function startOver() {
    phase = 'intro';
    introIndex = 0;
    roomId = '';
    found = [];
    currentEvidence = '';
    selectedSuspect = '';
    responses = [];
    accusation = [];
    resultMessage = '';
    hintMessage = '';
    hintIndex = {};
  }

  function nextIntro() {
    if (introIndex === intro.length - 1) {
      phase = 'cast';
      return;
    }
    introIndex += 1;
  }

  /** @param {string} id */
  function enterRoom(id) {
    roomId = id;
    currentEvidence = '';
  }

  /** @param {string} id */
  function inspect(id) {
    if (!found.includes(id)) found = [...found, id];
    currentEvidence = id;
  }

  /** @param {string} id */
  function chooseSuspect(id) {
    selectedSuspect = id;
    responses = [];
  }

  /** @param {number} index */
  function askAlibi(index) {
    const text = alibis[selectedSuspect][index];
    responses = [...responses, { text, source: index === 0 ? '알리바이' : '피해자와의 관계' }];
  }

  /** @param {string} id */
  function presentEvidence(id) {
    const response = reactions[selectedSuspect]?.[id];
    const text = response?.[0] ?? '…그 증거가 저와 무슨 상관이죠?';
    responses = [...responses, { text, source: evidence[id].name }];
  }

  /** @param {string} id */
  function toggleAccusation(id) {
    if (accusation.includes(id)) accusation = accusation.filter((item) => item !== id);
    else if (accusation.length < 3) accusation = [...accusation, id];
  }

  function arrest() {
    const relevant = accusation.filter((id) => ['e1', 'e2', 'e3', 'e5'].includes(id));
    if (selectedSuspect === 'sa' && relevant.length >= 2) phase = 'win';
    else {
      resultMessage = selectedSuspect !== 'sa'
        ? `${selected?.name}은(는) 범인이 아니었다. 진범은 그 사이 유유히 사라졌다…`
        : '증거가 부족했다. 최사원은 결정적 증거 없이 풀려났고 사건은 미궁에 빠졌다…';
      phase = 'fail';
    }
  }

  function showHint() {
    const list = hints[phase] ?? ['지금은 힌트가 필요 없어요.'];
    const index = Math.min(hintIndex[phase] ?? 0, list.length - 1);
    hintIndex = { ...hintIndex, [phase]: index + 1 };
    hintMessage = list[index];
  }
</script>

<svelte:head><title>덕일상사 살인사건 · 이상한 축제</title></svelte:head>

{#if hintMessage}
  <aside class="mx-auto mb-6 flex max-w-[960px] items-start justify-between gap-4 border border-festival-gold-border bg-festival-panel px-5 py-4" role="status"><p class="m-0 text-sm leading-[1.9] text-festival-copy"><span class="mr-2 text-festival-gold">힌트</span>{hintMessage}</p><button class="dismiss" aria-label="힌트 닫기" onclick={() => hintMessage = ''}>×</button></aside>
{/if}

{#if phase === 'title'}
  <section class="mx-auto max-w-[760px] border border-festival-line bg-festival-panel p-8 text-center max-[520px]:p-5">
    <p class="eyebrow">A CASE FOR ONE DETECTIVE</p>
    <div class="mb-7 border-y border-festival-line py-8">
      <span class="text-5xl text-festival-gold" aria-hidden="true">✳</span>
      <p class="my-4 text-[11px] tracking-[3px] text-festival-muted">덕일상사 · 23:00</p>
      <h1 class="m-0 font-serif text-[38px] font-medium leading-[1.5] tracking-[-1px] max-[520px]:text-[30px]">덕일상사 살인사건</h1>
      <p class="mt-3 text-sm leading-[1.9] text-festival-muted">네 명의 용의자, 아홉 개의 증거.<br />혼자 수사하고 범인을 밝혀내.</p>
    </div>
    <div class="mx-auto grid max-w-[540px] grid-cols-3 gap-3 text-left max-[520px]:grid-cols-1">
      {#each [{ number: '01', label: '현장 조사' }, { number: '02', label: '진술 검증' }, { number: '03', label: '범인 지목' }] as step}
        <div class="border border-festival-line px-4 py-3"><span class="text-[10px] tracking-[1px] text-festival-gold">{step.number}</span><p class="mb-0 mt-2 text-sm">{step.label}</p></div>
      {/each}
    </div>
    <button class="primary mx-auto max-w-[540px]" onclick={startOver}>사건 시작하기 <span>→</span></button>
    <button class="mt-5 cursor-pointer border-0 bg-transparent px-3 py-2 text-xs text-festival-muted hover:text-festival-gold" onclick={onExit}>축제 홈으로 돌아가기</button>
  </section>
{:else if phase === 'intro'}
  <section class="mx-auto max-w-[680px] border border-festival-line bg-festival-panel p-9 text-center max-[520px]:p-6">
    <p class="eyebrow">THE CASE FILE · {String(introIndex + 1).padStart(2, '0')} / {intro.length}</p>
    <div class="my-8 border-y border-festival-line py-10"><span class="text-4xl text-festival-gold" aria-hidden="true">✳</span><p class="mx-auto my-7 max-w-[520px] font-serif text-[20px] leading-[2] text-festival-copy">{intro[introIndex]}</p></div>
    <button class="primary mx-auto max-w-[400px]" onclick={nextIntro}>{introIndex === intro.length - 1 ? '등장인물 확인하기' : '다음'} <span>→</span></button>
  </section>
{:else if phase === 'cast'}
  <section class="mx-auto max-w-[840px]">
    <p class="eyebrow">THE SUSPECTS</p><h1 class="heading-one page-title">등장인물</h1><p class="muted mb-7">사건과 얽힌 네 사람. 진술과 증거를 하나씩 대조해 봐.</p>
    <div class="grid grid-cols-2 gap-4 max-[650px]:grid-cols-1">
      <article class="panel"><span class="eyebrow">THE VICTIM</span><h2 class="heading-two mb-2">박대리</h2><p class="muted">인망 좋기로 소문난 덕일상사 직원. 진급을 앞두고 있었고, 23시에 사망했다.</p></article>
      {#each suspects as suspect, i}
        <article class="panel"><div class="section-heading"><span class="eyebrow section-eyebrow">SUSPECT 0{i + 1}</span><span class="tag">용의자</span></div><h2 class="heading-two mb-2 mt-4">{suspect.name}</h2><p class="muted">{suspect.details}</p></article>
      {/each}
    </div>
    <button class="primary mt-6" onclick={() => { phase = 'explore'; }}>현장 조사 시작 <span>→</span></button>
  </section>
{:else if phase === 'explore'}
  <section class="mx-auto max-w-[960px]">
    <div class="page-heading"><div><p class="eyebrow">INVESTIGATION · 01</p><h1 class="heading-one page-title">현장 조사</h1><p class="muted">장소를 살펴보고 사건의 단서를 모아.</p></div><span class="tag gold">증거 {found.length} / 9</span></div>
    <div class="lobby-grid"><section class="grid grid-cols-2 gap-3 max-[520px]:grid-cols-1">
      {#each rooms as room}
        <button class="cursor-pointer border bg-festival-panel p-5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-festival-gold {roomId === room.id ? 'border-festival-gold' : 'border-festival-line hover:border-festival-gold-border'}" onclick={() => enterRoom(room.id)}>
          <span class="text-[10px] tracking-[1.5px] text-festival-gold">{room.id === 'pantry' ? 'BREAK ROOM' : room.id === 'stairs' ? 'EMERGENCY STAIR' : room.id === 'guard' ? 'SECURITY ROOM' : 'OFFICE'}</span>
          <h2 class="mb-1 mt-3 font-serif text-[19px] font-medium">{room.name}</h2><p class="muted">{room.mood}</p>
          <span class="mt-4 block text-xs text-festival-muted">조사한 증거 {room.evidence.filter((id) => found.includes(id)).length} / {room.evidence.length}</span>
        </button>
      {/each}
    </section><aside class="panel min-h-[210px]">
      {#if selectedRoom}
        <p class="eyebrow">SEARCH THE ROOM</p><h2 class="heading-two">{selectedRoom.name}</h2>
        <div class="grid gap-2">{#each selectedRoom.evidence as id}<button class="secondary mt-0" onclick={() => inspect(id)}><span>{found.includes(id) ? '✓ ' : ''}{evidence[id].name}</span><span>↗</span></button>{/each}</div>
        {#if currentEvidence}<div class="mt-5 border-t border-festival-line pt-4"><p class="mb-2 text-xs text-festival-gold">{evidence[currentEvidence].icon} {evidence[currentEvidence].name}</p><p class="m-0 text-sm leading-[1.9] text-festival-copy-soft">{evidence[currentEvidence].detail}</p></div>{/if}
      {:else}<p class="eyebrow">CRIME SCENE</p><h2 class="heading-two">어디부터 살펴볼까?</h2><p class="muted">장소를 선택하면 조사할 물건을 확인할 수 있어.</p>{/if}
    </aside></div>
    <div class="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-festival-line pt-5"><button class="text-button" onclick={showHint}>힌트 보기</button><button class="primary mt-0 w-auto min-w-[230px]" onclick={() => { phase = 'alibi'; selectedSuspect = ''; }}>1차 검증으로 <span>→</span></button></div>
  </section>
{:else if phase === 'alibi' || phase === 'cross'}
  <section class="mx-auto max-w-[960px]">
    <div class="page-heading"><div><p class="eyebrow">INTERROGATION · {phase === 'alibi' ? '02' : '03'}</p><h1 class="heading-one page-title">{phase === 'alibi' ? '알리바이 검증' : '증거 제시'}</h1><p class="muted">용의자를 선택해 질문하고 반응을 기록해.</p></div><span class="tag gold">수집한 증거 {found.length}개</span></div>
    <nav class="steps" aria-label="수사 단계"><span class="step">01 현장 조사</span><span class:active={phase === 'alibi'} class="step">02 알리바이</span><span class:active={phase === 'cross'} class="step">03 증거 제시</span><span class="step">04 범인 지목</span></nav>
    <div class="lobby-grid"><section class="grid grid-cols-2 gap-3 max-[520px]:grid-cols-1">{#each suspects as suspect}
      <button class="cursor-pointer border bg-festival-panel p-5 text-left focus-visible:outline-2 focus-visible:outline-festival-gold {selectedSuspect === suspect.id ? 'border-festival-gold' : 'border-festival-line hover:border-festival-gold-border'}" onclick={() => chooseSuspect(suspect.id)}><span class="text-[10px] tracking-[1px] text-festival-muted">SUSPECT</span><h2 class="mb-2 mt-3 font-serif text-[20px] font-medium">{suspect.name}</h2><p class="m-0 text-xs leading-[1.8] text-festival-muted">{suspect.details}</p></button>
    {/each}</section><aside class="panel min-h-[300px]">
      {#if selected}
        <p class="eyebrow">QUESTION · {selected.name}</p><h2 class="heading-two">무엇을 물어볼까?</h2>
        {#if phase === 'alibi'}<div class="grid gap-2"><button class="secondary mt-0" onclick={() => askAlibi(0)}>알리바이를 묻는다 <span>↗</span></button><button class="secondary mt-0" onclick={() => askAlibi(1)}>박대리와의 관계를 묻는다 <span>↗</span></button></div>
        {:else}<p class="muted mb-3">가방에서 증거를 골라 제시해.</p>{#if found.length}<div class="grid max-h-[230px] gap-2 overflow-auto">{#each found as id}<button class="secondary mt-0" onclick={() => presentEvidence(id)}><span>{evidence[id].icon} {evidence[id].name}</span><span>↗</span></button>{/each}</div>{:else}<p class="muted">아직 확보한 증거가 없어.</p>{/if}{/if}
        <div class="mt-5 grid gap-3">{#each responses.slice().reverse() as response}<blockquote class="m-0 border-l-2 border-festival-gold-border bg-festival-panel-input px-4 py-3"><span class="text-[10px] tracking-[1px] text-festival-gold">{response.source}</span><p class="mb-0 mt-2 text-sm leading-[1.9] text-festival-copy">“{response.text}”</p></blockquote>{/each}</div>
      {:else}<p class="eyebrow">INTERVIEW NOTES</p><h2 class="heading-two">용의자를 선택해</h2><p class="muted">한 사람씩 진술을 확인하고, 확보한 증거와 비교해 봐.</p>{/if}
    </aside></div>
    <div class="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-festival-line pt-5"><button class="text-button" onclick={showHint}>힌트 보기</button><div class="flex flex-wrap gap-3"><button class="secondary mt-0 w-auto" onclick={() => { phase = phase === 'alibi' ? 'explore' : 'alibi'; selectedSuspect = ''; }}>← 이전 단계</button>{#if phase === 'alibi'}<button class="primary mt-0 w-auto min-w-[190px]" onclick={() => { phase = 'cross'; selectedSuspect = ''; }}>증거 제시로 <span>→</span></button>{:else}<button class="primary mt-0 w-auto min-w-[190px]" onclick={() => { phase = 'accuse'; selectedSuspect = ''; accusation = []; }}>범인 지목하기 <span>→</span></button>{/if}</div></div>
  </section>
{:else if phase === 'accuse'}
  <section class="mx-auto max-w-[960px]">
    <p class="eyebrow">FINAL · 04</p><h1 class="heading-one page-title">범인을 지목하라</h1><p class="muted mb-7">범인 한 명과 사건을 뒷받침할 증거 세 개를 선택해.</p>
    <div class="lobby-grid"><section class="panel"><h2 class="heading-two">누가 박대리를 죽였을까?</h2><div class="grid grid-cols-2 gap-3 max-[520px]:grid-cols-1">{#each suspects as suspect}<button class="cursor-pointer border p-4 text-left focus-visible:outline-2 focus-visible:outline-festival-gold {selectedSuspect === suspect.id ? 'border-festival-gold bg-festival-panel-hover' : 'border-festival-line bg-transparent hover:border-festival-gold-border'}" onclick={() => chooseSuspect(suspect.id)}><span class="text-xs text-festival-muted">{selectedSuspect === suspect.id ? '● 선택됨' : '○ 선택'}</span><h3 class="heading-three mb-0 mt-2">{suspect.name}</h3></button>{/each}</div></section><aside class="panel"><div class="section-heading"><h2 class="heading-two mb-0">결정적 증거</h2><span class="tag gold">{accusation.length} / 3</span></div><p class="muted my-4">범행을 증명할 단서를 세 개 골라.</p><div class="grid max-h-[390px] gap-2 overflow-auto">{#each found as id}<button class="secondary mt-0" onclick={() => toggleAccusation(id)}><span>{accusation.includes(id) ? '☑' : '☐'} {evidence[id].icon} {evidence[id].name}</span><span>{accusation.includes(id) ? '선택됨' : ''}</span></button>{/each}</div></aside></div>
    <div class="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-festival-line pt-5"><button class="text-button" onclick={showHint}>힌트 보기</button><div class="flex gap-3"><button class="secondary mt-0 w-auto" onclick={() => { phase = 'cross'; selectedSuspect = ''; }}>증거 다시 확인</button><button class="primary mt-0 w-auto min-w-[190px]" disabled={!selectedSuspect || accusation.length !== 3} onclick={arrest}>체포한다 <span>→</span></button></div></div>
  </section>
{:else if phase === 'win'}
  <section class="mx-auto max-w-[760px] border border-festival-gold-border bg-festival-panel p-8 text-center max-[520px]:p-5"><p class="eyebrow">CASE CLOSED · SUCCESS</p><h1 class="heading-one page-title">사건 종결</h1><p class="muted">범인 최사원과 핵심 증거를 정확히 짚어냈어.</p><div class="mt-8 grid gap-3 text-left">{#each resolution as line, i}<article class="border border-festival-line p-5"><span class="text-[10px] tracking-[1px] text-festival-gold">결말 0{i + 1}</span><p class="mb-0 mt-3 font-serif text-[16px] leading-[2] text-festival-copy">{line}</p></article>{/each}</div><button class="primary mt-7" onclick={startOver}>다시 플레이하기 <span>↻</span></button><button class="mt-4 cursor-pointer border-0 bg-transparent px-3 py-2 text-xs text-festival-muted hover:text-festival-gold" onclick={onExit}>축제 홈으로 돌아가기</button></section>
{:else}
  <section class="mx-auto max-w-[680px] border border-festival-line bg-festival-panel p-8 text-center max-[520px]:p-5"><p class="eyebrow">CASE UNRESOLVED</p><span class="text-5xl text-festival-gold" aria-hidden="true">…</span><h1 class="heading-one page-title mt-5">사건이 미궁에 빠졌다</h1><p class="narrative">{resultMessage}</p><div class="mt-7 grid gap-3 sm:grid-cols-2"><button class="primary mt-0" onclick={startOver}>처음부터 다시하기 <span>↻</span></button><button class="secondary mt-0" onclick={onExit}>축제 홈으로 돌아가기 <span>↗</span></button></div></section>
{/if}
