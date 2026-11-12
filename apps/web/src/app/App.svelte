<script lang="ts">
  import { allowsService } from "../shared/analytics/consent";
  import { WORKSHOP_AUTHORING_ENABLED } from "@festival/shared/features";
  import PlayEnding from "../features/game/PlayEnding.svelte";
  import RoomSocial from "../features/friends/RoomSocial.svelte";
  import EntryIntro from "../pages/entry/ui/EntryIntro.svelte";
  import SoloRoomLifecycle from "../features/game/SoloRoomLifecycle.svelte";
  import LazyContent from "../shared/ui/LazyContent.svelte";
  import { shouldRecoverFocus } from "../shared/lib/focus-policy";
  import NicknameField from "../features/account/NicknameField.svelte";
  import type { Guest } from "@festival/shared";
  import { Modal, Button, Panel, PageState } from "../shared/ui";
  import { syncMetadata } from "../shared/seo/client";
  import { pageMetadata } from "../shared/seo/metadata";
  import { onMount, tick } from "svelte";
  import type { Command, ServerEvent, Snapshot } from "@festival/shared";
  import { clearSoloExit, matchesSoloExit, pendingSoloExit, type SoloExit } from "../shared/lib/solo-lifecycle";
  import { getLocaleFromPath, localePath, translate } from "../shared/lib";

  import LegalLinks from "../widgets/app-footer/ui/LegalLinks.svelte";
  import { ErrorNotice } from "../widgets/error-notice";


  const loadEntryPage = () => import("../pages/entry");
  const loadFooter = () => import("../widgets/app-footer");
  const loadHeader = () => import("../widgets/app-header");
  const loadFriendsDrawer = () => import('../features/friends/FriendsDrawer.svelte');
  const loadLobbyPage = () => import("../pages/lobby");
  const loadRoomPage = () => import("../pages/room");
  const loadStoryPicker = () => import("../widgets/story-picker");
  const loadNicknameSetup = () => import("../pages/account/_NicknameSetup.svelte");
  const loadAccountPage = () => import("../pages/account/_MyPage.svelte");
  const loadSoloGame = () => import("../pages/solo");
  const loadGamePage = () => import("../pages/game");
  const loadWorkshopPage = () => import("../pages/workshop/_index");
  const loadWorkshopEditor = () => import("../pages/workshop/ui/WorkshopEditor.svelte");

  let snapshot = $state<Snapshot | null>(null);
  let account = $state<{ me: Guest | null; accountType: string | null; needsNickname: boolean }>({ me: null, accountType: null, needsNickname: false });
  let authConfig = $state({ google: false, demo: false });
  let nickname = $state("");
  let code = $state("");
  let pendingJoin = $state<string | null>(null);
  let joinPin = $state("");
  let error = $state("");
  let busy = $state(false);
  let connected = $state(false);
  let loading = $state(true);
  let accountLoaded = false;
  let soloRecovery = $state<SoloExit | null>(null);
  let ownedSoloPlayId = $state<string | null>(null);
  let soloStartRequest: { requestId: string; roomId: string } | null = null;
  let soloEndedNotice = $state(false);
  let picker = $state(false);
  let copied = $state(false);
  let locale = $state<"ko" | "en">(getLocaleFromPath(location.pathname));
  const pagePath = (pathname: string) => {
    const path = pathname.replace(/^\/en(?=\/|$)/, "").replace(/\/+$/, "") || "/";
    return !WORKSHOP_AUTHORING_ENABLED && path === "/workshop/editor" ? "/workshop" : path;
  };
  let currentPath = $state(pagePath(location.pathname));
  const selectedWorkshopStory = () => {
    const id = new URLSearchParams(location.search).get("play");
    return pagePath(location.pathname) === "/workshop" && id && id.length <= 200 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) ? id : null;
  };
  let workshopPlayId = $state<string | null>(selectedWorkshopStory());
  let loginDialog = $state<HTMLDialogElement>(undefined!);
  let pendingWorkshopAction: (() => void) | undefined;
  type AuthDestination = { page: "workshop" | "editor" | "account"; id?: string };
  let pendingAuthDestination: AuthDestination | undefined;
  let pendingGoogleAction: (() => void) | undefined;
  let editorPath = $derived(WORKSHOP_AUTHORING_ENABLED && currentPath === "/workshop/editor");
  let entryHome = $derived(currentPath === "/" && snapshot === null);
  let editorHasChanges = $state(false);
  let editorId = $state<string | undefined>(new URLSearchParams(location.search).get("id") ?? undefined);
  let consentAccount: string | null | undefined = undefined;
  $effect(() => {
    const id = account.me?.id ?? null;
    if (consentAccount !== id) { consentAccount = id; window.dispatchEvent(new Event('consent:account')); }
  });
  $effect(() => { syncMetadata(localePath(locale, currentPath)); });
  const t = (key: string) => translate(locale, key as Parameters<typeof translate>[1]);

  let socket: WebSocket | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let authGeneration = 0;
  let authRequests = new AbortController();
  const currentAuth = (generation: number) => !disposed && generation === authGeneration;
  const pending = new Map<string, ReturnType<typeof setTimeout>>();

  let lobbyPresence = $derived(currentPath === "/" && !workshopPlayId && !snapshot?.room);
  $effect(() => {
    const lobby = lobbyPresence;
    if (connected && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "presence", lobby, requestId: crypto.randomUUID() }));
  });
  let room = $derived(snapshot?.room ?? null);
  let session = $derived(room?.session ?? null);
  let host = $derived(room?.hostId === snapshot?.me.id);
  let canStart = $derived(
    !!room && room.count === room.capacity && room.members.every((member) => member.online),
  );

  let shell = $state<HTMLDivElement>();
  let previousMain: HTMLElement | null = null;
  let lastFocusedControl: HTMLElement | null = null;
  let previousNavigation: string | undefined;
  let pendingNavigationFocus = false;

  function recoverMainFocus(navigationChanged = false) {
    if (disposed) return;
    pendingNavigationFocus = pendingNavigationFocus || navigationChanged;
    if (loading || !shell?.isConnected) return;
    const main = shell.querySelector<HTMLElement>('main');
    if (!main) return;
    const navigationRequested = pendingNavigationFocus;
    pendingNavigationFocus = false;
    const mainReplaced = previousMain !== null && previousMain !== main;
    const initialSignedIn = previousMain === null && !!account.me;
    previousMain = main;
    const active = document.activeElement;
    if (main && shouldRecoverFocus({
      ready: !loading,
      dialogOpen: !!document.querySelector('dialog[open]'),
      navigationChanged: navigationRequested,
      mainReplaced,
      focusedControlRemoved: !!lastFocusedControl && !lastFocusedControl.isConnected,
      initialSignedIn,
      focusLost: !active || active === document.body || !active.isConnected,
    })) main.focus();
  }

  $effect(() => {
    const navigation = [locale, currentPath].join(':');
    if (previousNavigation !== undefined && previousNavigation !== navigation) {
      void tick().then(() => recoverMainFocus(true));
    }
    previousNavigation = navigation;
  });

  async function api(path: string, body?: unknown) {
    const generation = authGeneration;
    const response = await fetch(`/api${path}`, {
      signal: authRequests.signal,
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    if (!currentAuth(generation)) throw new DOMException("Cancelled account request", "AbortError");
    if (!response.ok) {
      if (data.code === 'FULL_CONSENT_REQUIRED') { window.dispatchEvent(new Event('consent:account')); window.dispatchEvent(new Event('consent:required')); }
      throw Object.assign(new Error(data.code === 'FULL_CONSENT_REQUIRED' ? (locale === 'en' ? 'Full consent is required to use this service.' : '서비스 이용에는 전체 동의가 필요합니다.') : data.error ?? "요청에 실패했어."), { status: response.status, code: data.code });
    }
    return data;
  }

  async function action(run: () => Promise<void>) {
    if (busy) return;
    const generation = authGeneration;
    busy = true;
    error = "";
    try {
      await run();
    } catch (cause) {
      if (currentAuth(generation)) error = cause instanceof Error ? cause.message : "연결을 확인해 줘.";
    } finally {
      if (currentAuth(generation)) busy = false;
    }
  }

  function connect(generation = authGeneration) {
    if (!currentAuth(generation)) return;
    socket = new WebSocket(`${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/lobby/ws`);
    socket.onopen = () => {
      if (!currentAuth(generation)) return;
      connected = true;
      error = "";
    };
    socket.onmessage = (message) => {
      if (!currentAuth(generation)) return;
      try {
        const event = JSON.parse(message.data) as ServerEvent;
        if (event.type === "social-changed") { window.dispatchEvent(new Event("room-social-changed")); return; }
        if (event.type === "snapshot") {
          snapshot = event.data;
          if (ownedSoloPlayId !== snapshot.room?.soloPlayId) ownedSoloPlayId = null;
          if (soloRecovery && !matchesSoloExit(soloRecovery, snapshot.room)) {
            clearSoloExit(sessionStorage, soloRecovery);
            soloRecovery = null;
            soloEndedNotice = !snapshot.room?.soloStarted;
          }
        } else {
          if (soloStartRequest && soloStartRequest.requestId === event.requestId) {
            if (event.type === "ack" && snapshot?.room?.id === soloStartRequest.roomId && snapshot.room.soloStarted) {
              ownedSoloPlayId = snapshot.room.soloPlayId;
              if(ownedSoloPlayId)sessionStorage.setItem(`owned-solo:${snapshot.room.id}`,ownedSoloPlayId);
            }
            soloStartRequest = null;
          }
          if (event.requestId) {
            clearTimeout(pending.get(event.requestId));
            pending.delete(event.requestId);
            busy = false;
          }
          if (event.type === "error") error = event.message;
        }
      } catch {
        error = "서버 응답을 확인할 수 없어.";
      }
    };
    socket.onclose = (event) => {
      if (!currentAuth(generation)) return;
      if (event.code === 1008) window.dispatchEvent(new Event('consent:account'));
      connected = false;
      for (const timeout of pending.values()) clearTimeout(timeout);
      pending.clear();
      soloStartRequest = null;
      busy = false;
      if (!disposed && allowsService()) {
        reconnectTimer = setTimeout(async () => {
          try {
            const next = await api("/lobby/state");
            if (!currentAuth(generation)) return;
            snapshot = next;
            connect(generation);
          } catch (cause) {
            if (!currentAuth(generation)) return;
            if ((cause as { status?: number }).status === 401) {
              snapshot = null;
              error = "게스트 로그인이 만료됐어.";
            } else if (!disposed) {
              connect();
            }
          }
        }, 2000);
      }
    };
    socket.onerror = () => {
      if (!currentAuth(generation)) return;
      error = "실시간 연결을 확인 중이야.";
    };
  }

  function handleAuthLost() {
    authGeneration++;
    authRequests.abort();
    authRequests = new AbortController();
    loading = false;
    account = { me: null, accountType: null, needsNickname: false };
    snapshot = null; picker = false; pendingJoin = null; joinPin = ""; accountLoaded = false;
    connected = false; busy = false; ownedSoloPlayId = null; soloStartRequest = null;
    clearTimeout(reconnectTimer);
    for (const timeout of pending.values()) clearTimeout(timeout);
    pending.clear();
    if (socket) {
      socket.onclose = null; socket.onmessage = null; socket.onopen = null; socket.onerror = null;
      socket.close(); socket = undefined;
    }
  }

  function command(type: Command["type"], targetId?: string, mode?: "solo" | "multiplayer") {
    if (!connected || busy || !socket) return;
    if (type === "start") soloEndedNotice = false;
    error = "";
    busy = true;
    const requestId = crypto.randomUUID();
    if (type === "start" && room?.mode === "solo") soloStartRequest = { requestId, roomId: room.id };
    pending.set(
      requestId,
      setTimeout(() => {
        pending.delete(requestId);
        busy = false;
        if (soloStartRequest?.requestId === requestId) soloStartRequest = null;
        error = "응답이 지연됐어. 현재 상태를 확인하고 다시 시도해 줘.";
      }, 8000),
    );
    const transfer = type === "transfer-item" && targetId ? targetId.split("|", 2) : null;
    socket.send(JSON.stringify({ type, requestId, ...(targetId ? (type === "choose-final" ? { choiceId: targetId } : type === "move-room" ? { roomId: targetId } : type === "collect-item" || type === "reveal-item" || type === "use-item" ? { itemId: targetId } : type === "combine-items" ? { recipeId: targetId } : type === "transfer-item" && transfer ? { itemId: transfer[0], targetId: transfer[1] } : { targetId }) : {}), ...(mode ? { mode } : {}) }));
  }

  function changeLocale(next: "ko" | "en") {
    locale = next;
    document.documentElement.lang = next;
    history.pushState({}, "", `${localePath(next, location.pathname)}${location.search}${location.hash}`);
  }

  function openWorkshop() {
    workshopPlayId = null;
    picker = false;
    currentPath = "/workshop";
    history.pushState({}, "", localePath(locale, "/workshop"));
  }

  function playWorkshopStory(id: string) {
    if (room) {
      error = locale === "en" ? "Leave your room before starting a workshop story." : "참가 중인 방에서 나온 뒤 창작 작품을 시작해 줘.";
      return;
    }
    workshopPlayId = id;
    history.pushState({}, "", `${localePath(locale, "/workshop")}?play=${encodeURIComponent(id)}`);
  }

  function openEditor(id?: string) {
    if (!WORKSHOP_AUTHORING_ENABLED) { openWorkshop(); return; }
    if (!snapshot) { requestWorkshopLogin(() => openEditor(id), { page: "editor", id }); return; }
    editorId = id;
    currentPath = "/workshop/editor";
    history.pushState({}, "", `${localePath(locale, currentPath)}${id ? `?id=${encodeURIComponent(id)}` : ""}`);
  }

  function requestWorkshopLogin(resume?: () => void, destination: AuthDestination = { page: "workshop" }) {
    pendingWorkshopAction = resume;
    pendingAuthDestination = destination;
    loginDialog.showModal();
  }

  function createWorkshopStory() {
    if (!WORKSHOP_AUTHORING_ENABLED) { openWorkshop(); return; }
    if (snapshot) openEditor();
    else requestWorkshopLogin(() => openEditor(), { page: "editor" });
  }

  function savedWorkshopStory(id: string) {
    editorId = id;
    history.replaceState({}, "", `${localePath(locale, "/workshop/editor")}?id=${encodeURIComponent(id)}`);
  }

  function selectGameMode(modeId: string) {
    if (modeId === "host") picker = true;
  }

  async function loadAccount() {
    const generation = authGeneration;
    const nextAccount = await api("/platform/account");
    if (!currentAuth(generation)) return;
    account = nextAccount;
    if (account.me && !account.needsNickname && allowsService()) {
      const next = await api("/lobby/state");
      if (!currentAuth(generation)) return;
      snapshot = next;
      if(snapshot?.room?.soloStarted&&snapshot.room.hostId===snapshot.me.id)ownedSoloPlayId=snapshot.room.soloPlayId;
      if (!accountLoaded) {
        soloRecovery = pendingSoloExit(sessionStorage, snapshot?.room ?? null);
        if (soloRecovery) await reconcileSolo();
        if (!currentAuth(generation)) return;
      }
      accountLoaded = true;
      if (!socket || socket.readyState > 1) connect(generation);
      resumeGoogleAction();
    }
  }
  async function reconcileSolo() {
    if (!soloRecovery) return;
    const generation = authGeneration;
    const exit = soloRecovery;
    await api("/lobby/rooms/solo-exit", exit);
    if (!currentAuth(generation)) return;
    const next = await api("/lobby/state");
    if (!currentAuth(generation)) return;
    snapshot = next;
    clearSoloExit(sessionStorage, exit);
    soloRecovery = null;
    soloEndedNotice = true;
  }
  function soloPageExited(exit: SoloExit) {
    ownedSoloPlayId = null;
    if (matchesSoloExit(exit, snapshot?.room ?? null)) soloRecovery = exit;
    else clearSoloExit(sessionStorage, exit);
  }
  function openAccount() {
    if (editorPath && editorHasChanges && !window.confirm(locale === 'en' ? 'Discard unsaved changes?' : '저장하지 않은 변경을 버리고 나갈까요?')) return;
    if (!snapshot) { requestWorkshopLogin(openAccount, { page: "account" }); return; }
    currentPath = "/mypage";
    history.pushState({}, "", localePath(locale, currentPath));
  }
  function rememberGoogleAction() {
    const destination = pendingAuthDestination ?? (editorPath ? { page: "editor", id: editorId } : currentPath === "/mypage" ? { page: "account" } : currentPath === "/workshop" ? { page: "workshop" } : undefined);
    pendingGoogleAction = pendingWorkshopAction;
    sessionStorage.removeItem("festival_auth_return");
    if (destination) sessionStorage.setItem("festival_auth_return", JSON.stringify(destination));
  }
  function resumeGoogleAction() {
    if (!snapshot || account.needsNickname) return;
    const stored = sessionStorage.getItem("festival_auth_return");
    sessionStorage.removeItem("festival_auth_return");
    const resume = pendingGoogleAction;
    pendingGoogleAction = undefined;
    pendingAuthDestination = undefined;
    if (resume) { resume(); return; }
    if (!stored) return;
    try {
      const destination = JSON.parse(stored) as AuthDestination;
      if (destination.page === "editor" && (destination.id === undefined || typeof destination.id === "string" && destination.id.length <= 200)) openEditor(destination.id);
      else if (destination.page === "account") openAccount();
      else if (destination.page === "workshop") openWorkshop();
    } catch { /* Ignore an invalid saved destination; never navigate to an arbitrary URL. */ }
  }
  async function googleLogin() {
    if (!allowsService()) { window.dispatchEvent(new Event('consent:required')); return; }
    if (authConfig.google) { rememberGoogleAction(); location.assign(`/api/platform/auth/google?locale=${locale}`); return; }
    await action(async () => {
      if (!authConfig.demo) throw Error(locale === "en" ? "Google sign-in is not configured. Please use guest sign-in." : "구글 로그인 설정이 필요해요. 게스트 로그인을 이용해 주세요.");
      rememberGoogleAction();
      const generation = authGeneration;
      const next = await api("/platform/auth/google/demo", {});
      if (!currentAuth(generation)) return;
      account = next;
      nickname = "";
      loginDialog?.close();
      await loadAccount();
    });
  }
  async function rename(next: string) {
    await action(async () => {
      const generation = authGeneration;
      const nextAccount = await api("/platform/account/nickname", { nickname: next });
      if (!currentAuth(generation)) return;
      account = nextAccount; await loadAccount();
    });
  }
  async function logout(remove = false) {
    await action(async () => {
      const generation = authGeneration;
      await api(remove ? "/platform/account/delete" : "/platform/account/logout", {});
      if (!currentAuth(generation)) return;
      sessionStorage.removeItem("festival_auth_return");
      if (socket) { socket.onclose = null; socket.close(); }
      clearTimeout(reconnectTimer);
      location.assign(localePath(locale));
    });
  }
  async function login() {
    if (!allowsService()) { window.dispatchEvent(new Event('consent:required')); return; }
    const resume = loginDialog?.open ? pendingWorkshopAction : undefined;
    pendingWorkshopAction = undefined;
    await action(async () => {
      const generation = authGeneration;
      await api("/platform/guest", { nickname });
      if (!currentAuth(generation)) return;
      await loadAccount();
      if (!currentAuth(generation)) return;
      if (loginDialog?.open) {
        loginDialog.close();
        await tick();
        if (currentAuth(generation)) resume?.();
      }
    });
  }

  async function create(scenarioId: string, access: "public" | "friends" | "secret" = "public", pin?: string) {
    await action(async () => {
      const generation = authGeneration;
      await api("/lobby/rooms", { scenarioId, access, pin });
      if (!currentAuth(generation)) return;
      const next = await api("/lobby/state");
      if (!currentAuth(generation)) return;
      snapshot = next;
      picker = false;
    });
  }

  async function join(invite = code) {
    const target = snapshot?.rooms.find(r => r.code === invite);
    if (target?.access === "secret" || !target) { pendingJoin = invite; joinPin = ""; return; }
    await enterRoom(invite);
  }

  async function enterRoom(invite: string, pin?: string) {
    await action(async () => {
      const generation = authGeneration;
      await api("/lobby/rooms/join", { code: invite, ...(pin ? { pin } : {}) });
      if (!currentAuth(generation)) return;
      const next = await api("/lobby/state");
      if (!currentAuth(generation)) return;
      snapshot = next;
      code = "";
      pendingJoin = null;
      joinPin = "";
    });
  }

  async function refreshLobby() {
    snapshot=await api('/lobby/state');
    ownedSoloPlayId=null;
    currentPath='/';history.pushState({},'',localePath(locale));
  }
  async function exitSoloRoom() {
    if(room?.soloStarted) await api('/lobby/rooms/solo-exit',{roomId:room.id,soloPlayId:room.soloPlayId});
    await refreshLobby();
  }
  async function copyInviteLink() {
    try {
      await navigator.clipboard.writeText(`${location.origin}/?room=${room?.code}`);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      error = `초대 코드: ${room?.code}`;
    }
  }

  onMount(() => {
    const syncCollectionState = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if ((detail?.pending || detail?.error) && !detail?.restricting && !detail?.forceUnload) return;
      if (allowsService()) { void action(loadAccount); return; }
      if (socket) { socket.onclose = null; socket.close(); }
      clearTimeout(reconnectTimer);
      snapshot = null;
    };
    window.addEventListener('consent:changed', syncCollectionState);
    const rememberFocus = (event: FocusEvent) => {
      const target = event.target;
      lastFocusedControl = target instanceof HTMLElement && target.closest('main') ? target : null;
    };
    shell?.addEventListener('focusin', rememberFocus);
    const focusObserver = new MutationObserver(() => { void tick().then(() => recoverMainFocus()); });
    if (shell) focusObserver.observe(shell, { childList: true, subtree: true });
    const syncLocale = () => {
      if (loginDialog?.open) loginDialog.close();
      locale = getLocaleFromPath(location.pathname);
      currentPath = pagePath(location.pathname);
      workshopPlayId = selectedWorkshopStory();
      code = new URLSearchParams(location.search).get("room") ?? "";
      editorId = new URLSearchParams(location.search).get("id") ?? undefined;
      document.documentElement.lang = locale;
    };
    window.addEventListener("popstate", syncLocale);
    void (async () => {
      const generation = authGeneration;
      try {
        const config = await api("/platform/auth/config");
        if (!currentAuth(generation)) return;
        authConfig = config;
        const authError = new URLSearchParams(location.search).get("auth");
        if (authError) sessionStorage.removeItem("festival_auth_return");
        await loadAccount();
        if (!currentAuth(generation)) return;
        if (authError) error = locale === "en" ? "Google sign-in was cancelled or failed. Please try again." : "구글 로그인이 취소되었거나 실패했어요. 다시 시도해 주세요.";
      } catch (cause) {
        if (!currentAuth(generation)) return;
        if ((cause as { status?: number }).status !== 401) {
          error = (cause as {code?:string}).code === 'FULL_CONSENT_REQUIRED' ? (locale === 'en' ? 'Full consent is required to sign in and play.' : '로그인·플레이에는 전체 동의가 필요합니다.') : '서버에 연결할 수 없어. 잠시 후 새로고침해 줘.';
        }
      } finally {
        if (currentAuth(generation)) {
        code = new URLSearchParams(location.search).get("room") ?? "";
        loading = false;
        }
      }
    })();

    return () => {
      focusObserver.disconnect();
      shell?.removeEventListener('focusin', rememberFocus);
      disposed = true;
      window.removeEventListener('consent:changed', syncCollectionState);
      authGeneration++;
      authRequests.abort();
      window.removeEventListener("popstate", syncLocale);
      clearTimeout(reconnectTimer);
      for (const timeout of pending.values()) clearTimeout(timeout);
      socket?.close();
    };
  });
</script>

{#snippet publicEntryLoading(failed: boolean)}
  <main id="main-content" tabindex="-1" class="main flex items-center justify-center">
    <section class="w-full max-w-sm py-8" aria-labelledby="entry-title">
      <EntryIntro {locale} />
      <p role={failed ? 'alert' : 'status'}>{failed ? (locale === 'en' ? 'Could not load this page. Please refresh.' : '화면을 불러오지 못했어요. 새로고침해 주세요.') : t('workshopLoading')}</p>
      {#if failed}<Button variant="secondary" onclick={() => window.location.reload()}>{locale === 'en' ? 'Refresh' : '새로고침'}</Button>{/if}
    </section>
  </main>
{/snippet}

<svelte:head>
  <title>{pageMetadata(localePath(locale, currentPath)).title}</title>
</svelte:head>

<div class="shell" bind:this={shell}>
  {#if !entryHome}
    <LazyContent load={loadHeader} {locale} embedded>{#snippet children({ AppHeader })}<AppHeader {snapshot} {connected} {locale} {t} accountType={account.accountType} onAccount={openAccount} onLocaleChange={changeLocale} />{/snippet}</LazyContent>
  {/if}

  {#if error}
    <ErrorNotice message={error} {locale} onDismiss={() => (error = "")} />
  {/if}
  {#if soloEndedNotice}
    <p class="main" role="status">{locale === "en" ? "Your previous solo investigation ended when you left the page. You are back in the room; start a new investigation when ready." : "페이지를 떠나 이전 1인 수사가 종료됐어. 같은 방으로 돌아왔으니 준비되면 새 수사를 시작해 줘."}</p>
  {/if}

  {#if loading}
    {#if entryHome}{@render publicEntryLoading(false)}{:else}<PageState kind="loading" message={t("workshopLoading")} />{/if}
  {:else if soloRecovery && snapshot}
    <main id="main-content" tabindex="-1" class="main"><Panel><p role="status">{locale === "en" ? "The previous solo investigation has ended. Reconnect to return to your room." : "이전 1인 수사가 종료됐어. 연결을 확인한 뒤 같은 방으로 돌아가 줘."}</p><Button disabled={busy} onclick={() => void action(async () => { await reconcileSolo(); if (!socket || socket.readyState > 1) connect(); })}>{locale === "en" ? "Retry returning to room" : "방 복귀 다시 시도"}</Button></Panel></main>
  {:else if account.needsNickname}
    <LazyContent load={loadNicknameSetup} {locale}>
      {#snippet children({ default: NicknameSetup })}
        <NicknameSetup bind:nickname {locale} {busy} onRename={rename} onLogout={() => void logout()} />
      {/snippet}
    </LazyContent>
  {:else if currentPath === "/mypage" && account.me}
    <LazyContent load={loadAccountPage} {locale}>
      {#snippet children({ default: MyPage })}
        {#if account.me}<MyPage onAuthLost={handleAuthLost} me={account.me} accountType={account.accountType} {locale} {busy} onRename={rename} onLogout={() => logout()} onDeleteAccount={() => logout(true)} onEdit={openEditor} onWorkshop={openWorkshop} />{/if}
      {/snippet}
    </LazyContent>
  {:else if currentPath === "/workshop" && workshopPlayId && room}
    <main id="main-content" tabindex="-1" class="main"><Panel><p role="status">{locale === "en" ? "Leave your room before starting a workshop story." : "참가 중인 방에서 나온 뒤 창작 작품을 시작해 줘."}</p><Button onclick={openWorkshop}>{locale === "en" ? "Back to workshop" : "창작마당으로 돌아가기"}</Button></Panel></main>
  {:else if currentPath === "/workshop" && workshopPlayId}
    {#key workshopPlayId}<main id="main-content" tabindex="-1" class="main"><LazyContent load={loadSoloGame} {locale} embedded>
      {#snippet children({ SoloGame })}
        {#if workshopPlayId}<SoloGame {locale} storyId={workshopPlayId} onExit={openWorkshop} exitLabel={locale === "en" ? "Back to workshop" : "창작마당으로 돌아가기"} />{/if}
      {/snippet}
    </LazyContent></main>{/key}
  {:else if currentPath === "/workshop"}
    <LazyContent load={loadWorkshopPage} {locale}>
      {#snippet children({ WorkshopPage })}
        <WorkshopPage {locale} onPlay={playWorkshopStory} loggedIn={snapshot !== null} onLogin={requestWorkshopLogin} onEdit={(id) => id ? openEditor(id) : createWorkshopStory()} />
      {/snippet}
    </LazyContent>
  {:else if editorPath && snapshot}
    {#key editorId}<LazyContent load={loadWorkshopEditor} {locale}>
      {#snippet children({ default: WorkshopEditor })}
        <WorkshopEditor {locale} onDirtyChange={(dirty) => { editorHasChanges = dirty; }} storyId={editorId} onBack={openWorkshop} onSaved={savedWorkshopStory} />
      {/snippet}
    </LazyContent>{/key}
  {:else if !snapshot}
    <LazyContent load={loadEntryPage} {locale} fallback={entryHome ? publicEntryLoading : undefined}>{#snippet children({ EntryPage })}<EntryPage bind:nickname {busy} {t} {locale} demo={authConfig.demo} onGoogle={googleLogin} onLogin={login} />{/snippet}</LazyContent>
  {:else if snapshot?.endingSessionId}
    <main id="main-content" tabindex="-1" class="main">{#key snapshot.endingSessionId}<PlayEnding id={snapshot.endingSessionId} {locale} onExit={() => void refreshLobby()} />{/key}</main>
  {:else if room?.soloStarted && ownedSoloPlayId !== room.soloPlayId}
    <main id="main-content" tabindex="-1" class="main"><Panel><h1 class="heading-one">{locale === "en" ? "Investigation in progress" : "수사 진행 중"}</h1><p role="status">{locale === "en" ? "A solo investigation is open in another page. Return to that page to continue. Ending it here also closes that investigation." : "다른 페이지에서 1인 수사가 열려 있어. 수사를 이어가려면 해당 페이지로 돌아가 줘. 여기서 종료하면 그 수사도 끝나."}</p><Button disabled={busy || !connected} onclick={() => command("solo-return")}>{locale === "en" ? "End investigation and return to room" : "수사 종료하고 방으로 돌아가기"}</Button></Panel></main>
  {:else if room?.soloStarted}
    {#key room.soloPlayId}<SoloRoomLifecycle exit={{ roomId: room.id, soloPlayId: room.soloPlayId }} ><main id="main-content" tabindex="-1" class="main"><LazyContent load={loadSoloGame} {locale} embedded>
      {#snippet children({ SoloGame })}
        <SoloGame {locale} storyId={room.soloStory.id} exitDisabled={!connected || busy} exitMessage={!connected ? (locale === "en" ? "Reconnecting. Return to the room when the connection is restored." : "재연결 중이야. 연결이 복구되면 방으로 돌아갈 수 있어.") : busy ? (locale === "en" ? "Returning to the room…" : "방으로 돌아가는 중…") : ""} exitLabel={locale === "en" ? "Leave" : "나가기"} onExit={() => action(exitSoloRoom)} />
      {/snippet}
    </LazyContent></main></SoloRoomLifecycle>{/key}
  {:else if !room}
    <LazyContent load={loadLobbyPage} {locale}>
      {#snippet children({ LobbyPage })}
        {#if snapshot}<LobbyPage
      bind:code
      {snapshot}
      {busy}
      {connected}
      {t}
      onSelectMode={selectGameMode}
      onJoin={join}
    />{/if}
      {/snippet}
    </LazyContent>
  {:else if !session}
    <LazyContent load={loadRoomPage} {locale}>
      {#snippet children({ RoomPage })}
        {#if snapshot}<RoomPage
      {snapshot}
      {room}
      {host}
      {canStart}
      {busy}
      {connected}
      {copied}
      {locale}
      onCopy={copyInviteLink}
      onCommand={command}
    />{/if}
      {/snippet}
    </LazyContent>
  {:else}
    <LazyContent load={loadGamePage} {locale}>
      {#snippet children({ GamePage })}
        <GamePage {room} {session} {host} {busy} {connected} onCommand={command} />
      {/snippet}
    </LazyContent>
  {/if}

  {#if snapshot}
  {#key snapshot.me.id}<RoomSocial {snapshot} onEntered={async () => { snapshot = await api("/lobby/state"); currentPath = "/"; history.pushState({}, "", localePath(locale)); }} />{/key}
{/if}

  {#if entryHome}
    <footer class="flex justify-center py-4 text-festival-muted"><LegalLinks {locale} /></footer>
  {:else}
    <LazyContent load={loadFooter} {locale} embedded>{#snippet children({ AppFooter })}<AppFooter {snapshot} {connected} {t} {locale} />{/snippet}</LazyContent>
  {/if}
</div>

{#if snapshot && account.accountType === 'google' && !room && !workshopPlayId && currentPath === '/'}
  {#key snapshot.me.id}<LazyContent load={loadFriendsDrawer} {locale} embedded>{#snippet children({ default: FriendsDrawer })}{#if snapshot}<FriendsDrawer {locale} accountId={snapshot.me.id} onAuthLost={handleAuthLost} />{/if}{/snippet}</LazyContent>{/key}
{/if}

{#if picker && snapshot}
<LazyContent load={loadStoryPicker} {locale} embedded>
{#snippet children({ StoryPickerDialog })}
<StoryPickerDialog
  open={picker && snapshot !== null}
  {busy}
  {connected}
  {t}
  onClose={() => (picker = false)}
  onWorkshop={openWorkshop}
  onCreate={create}
/>
{/snippet}
</LazyContent>
{/if}


<Modal bind:element={loginDialog} class="workshop-login" onClose={() => { pendingWorkshopAction = undefined; pendingAuthDestination = undefined; }} labelledby="workshop-login-title">
  <h2 id="workshop-login-title">{locale === "en" ? "Sign in to the workshop" : "창작마당 로그인"}</h2>
  <p>{locale === "en" ? "Sign in with a guest nickname to create stories and save favorites." : "닉네임으로 게스트 로그인하면 창작과 즐겨찾기를 이용할 수 있어요."}</p>
  <Button variant="secondary" disabled={busy} onclick={() => void googleLogin()}>{locale === "en" ? "Continue with Google" : "구글로 로그인"}{authConfig.demo ? (locale === "en" ? " (test)" : " (테스트)") : ""}</Button>
  <form onsubmit={(event) => { event.preventDefault(); void login(); }}>
    <NicknameField id="workshop-nickname" bind:value={nickname} {locale} {busy} />
    {#if error}<p role="alert">{error}</p>{/if}
    <div class="login-actions"><Button type="submit" class="primary" disabled={busy} variant="primary">{locale === "en" ? "Sign in" : "로그인"}</Button><Button type="button" class="secondary" onclick={() => loginDialog.close()} variant="secondary">{locale === "en" ? "Cancel" : "취소"}</Button></div>
  </form>
</Modal>
<style>
:global(.workshop-login) h2 {
  font-size:var(--typography-size-control-6)}
:global(.workshop-login) p {
  margin:var(--spacing-4) 0;
  line-height:1.7}
:global(.workshop-login) label {
  display:block;
  margin-bottom:var(--spacing-2)}
:global(.workshop-login) :global(.primary),:global(.workshop-login) :global(.secondary) {
  width:auto;
  margin-top:0}
.login-actions {
  display:flex;
  gap:var(--spacing-4);
  margin-top:var(--spacing-4)}
</style>

{#if pendingJoin && snapshot}
  <Modal open labelledby="room-pin-title" onClose={() => { pendingJoin = null; joinPin = ''; }}>
    <h2 id="room-pin-title">방 입장</h2>
    <form onsubmit={event => { event.preventDefault(); if (pendingJoin) void enterRoom(pendingJoin, joinPin || undefined); }}>
      <label>비밀방 PIN · 공개방은 비워 두세요<input type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" bind:value={joinPin} /></label>
      <Button type="submit" disabled={busy}>입장</Button>
      <Button variant="secondary" onclick={() => pendingJoin = null}>취소</Button>
      {#if error}<p role="alert">{error}</p>{/if}
    </form>
  </Modal>
{/if}
