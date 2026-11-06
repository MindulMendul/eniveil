<script lang="ts">
  import { onMount } from "svelte";
  import type { Command, ServerEvent, Snapshot } from "@festival/shared";
  import { SoloGame } from "../pages/solo";
  import { gameModes } from "./game-modes.js";
  import { getLocaleFromPath, localePath, translate } from "../shared/lib";

  import { EntryPage } from "../pages/entry";
  import { GamePage } from "../pages/game";
  import { LobbyPage } from "../pages/lobby";
  import { WorkshopPage } from "../pages/workshop/_index";
  import WorkshopEditor from "../pages/workshop/ui/WorkshopEditor.svelte";
  import { RoomPage } from "../pages/room";
  import { AppFooter } from "../widgets/app-footer";
  import { AppHeader } from "../widgets/app-header";
  import { ErrorNotice } from "../widgets/error-notice";
  import { StoryPickerDialog } from "../widgets/story-picker";

  let snapshot = $state<Snapshot | null>(null);
  let nickname = $state("");
  let code = $state("");
  let error = $state("");
  let busy = $state(false);
  let connected = $state(false);
  let loading = $state(true);
  let picker = $state(false);
  let copied = $state(false);
  let locale = $state<"ko" | "en">(getLocaleFromPath(location.pathname));
  const pagePath = (pathname: string) => pathname.replace(/^\/en(?=\/|$)/, "") || "/";
  let currentPath = $state(pagePath(location.pathname));
  let soloActive = $state(false);
  let loginDialog: HTMLDialogElement;
  let pendingEditor = $state(false);
  let pendingStoryId = $state<string | undefined>();
  let editorPath = $derived(currentPath.startsWith("/workshop/editor"));
  let editorId = $state<string | undefined>(new URLSearchParams(location.search).get("id") ?? undefined);
  const t = (key: string) => translate(locale, key as Parameters<typeof translate>[1]);

  let socket: WebSocket | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const pending = new Map<string, ReturnType<typeof setTimeout>>();

  let room = $derived(snapshot?.room ?? null);
  let session = $derived(room?.session ?? null);
  let host = $derived(room?.hostId === snapshot?.me.id);
  let canStart = $derived(
    !!room && room.count === room.capacity && room.members.every((member) => member.online),
  );

  async function api(path: string, body?: unknown) {
    const response = await fetch(`/api${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) {
      throw Object.assign(new Error(data.error ?? "요청에 실패했어."), { status: response.status });
    }
    return data;
  }

  async function action(run: () => Promise<void>) {
    if (busy) return;
    busy = true;
    error = "";
    try {
      await run();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "연결을 확인해 줘.";
    } finally {
      busy = false;
    }
  }

  function connect() {
    if (disposed) return;
    socket = new WebSocket(`${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/lobby/ws`);
    socket.onopen = () => {
      connected = true;
      error = "";
    };
    socket.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as ServerEvent;
        if (event.type === "snapshot") {
          snapshot = event.data;
        } else {
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
    socket.onclose = () => {
      connected = false;
      for (const timeout of pending.values()) clearTimeout(timeout);
      pending.clear();
      busy = false;
      if (!disposed) {
        reconnectTimer = setTimeout(async () => {
          try {
            snapshot = await api("/lobby/state");
            connect();
          } catch (cause) {
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
      error = "실시간 연결을 확인 중이야.";
    };
  }

  function command(type: Command["type"], targetId?: string) {
    if (!connected || busy || !socket) return;
    error = "";
    busy = true;
    const requestId = crypto.randomUUID();
    pending.set(
      requestId,
      setTimeout(() => {
        pending.delete(requestId);
        busy = false;
        error = "응답이 지연됐어. 현재 상태를 확인하고 다시 시도해 줘.";
      }, 8000),
    );
    socket.send(JSON.stringify({ type, requestId, ...(targetId ? { targetId } : {}) }));
  }

  function changeLocale(next: "ko" | "en") {
    locale = next;
    document.documentElement.lang = next;
    history.pushState({}, "", `${localePath(next, location.pathname)}${location.search}${location.hash}`);
  }

  function openWorkshop() {
    picker = false;
    currentPath = "/workshop";
    history.pushState({}, "", localePath(locale, "/workshop"));
  }

  function openEditor(id?: string) {
    if (!snapshot) { requestWorkshopLogin(id); return; }
    editorId = id;
    currentPath = "/workshop/editor";
    history.pushState({}, "", `${localePath(locale, currentPath)}${id ? `?id=${encodeURIComponent(id)}` : ""}`);
  }

  function requestWorkshopLogin(id?: string) {
    pendingEditor = id !== undefined;
    pendingStoryId = id;
    loginDialog.showModal();
  }

  function createWorkshopStory() {
    if (snapshot) openEditor();
    else { pendingEditor = true; pendingStoryId = undefined; loginDialog.showModal(); }
  }

  function savedWorkshopStory(id: string) {
    editorId = id;
    history.replaceState({}, "", `${localePath(locale, "/workshop/editor")}?id=${encodeURIComponent(id)}`);
  }

  function startSolo() {
    if (!snapshot) return;
    soloActive = true;
  }

  function selectGameMode(modeId: string) {
    if (modeId === "solo") startSolo();
    if (modeId === "host") picker = true;
  }

  async function login() {
    await action(async () => {
      await api("/platform/guest", { nickname });
      snapshot = await api("/lobby/state");
      connect();
      if (loginDialog?.open) {
        loginDialog.close();
        if (pendingEditor) openEditor(pendingStoryId);
        pendingEditor = false; pendingStoryId = undefined;
      }
    });
  }

  async function create(scenarioId: string) {
    await action(async () => {
      await api("/lobby/rooms", { scenarioId });
      snapshot = await api("/lobby/state");
      picker = false;
    });
  }

  async function join(invite = code) {
    await action(async () => {
      await api("/lobby/rooms/join", { code: invite });
      snapshot = await api("/lobby/state");
      code = "";
    });
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
    const syncLocale = () => {
      locale = getLocaleFromPath(location.pathname);
      currentPath = pagePath(location.pathname);
      editorId = new URLSearchParams(location.search).get("id") ?? undefined;
      document.documentElement.lang = locale;
    };
    window.addEventListener("popstate", syncLocale);
    void (async () => {
      try {
        snapshot = await api("/lobby/state");
        connect();
      } catch (cause) {
        if ((cause as { status?: number }).status !== 401) {
          error = "서버에 연결할 수 없어. 잠시 후 새로고침해 줘.";
        }
      } finally {
        code = new URLSearchParams(location.search).get("room") ?? "";
        loading = false;
      }
    })();

    return () => {
      disposed = true;
      window.removeEventListener("popstate", syncLocale);
      clearTimeout(reconnectTimer);
      for (const timeout of pending.values()) clearTimeout(timeout);
      socket?.close();
    };
  });
</script>

<svelte:head>
  <title>{currentPath.startsWith("/workshop") ? t("workshopTitle") : room ? `${room.title} · ${t("brand")}` : t("homeTitle")}</title>
</svelte:head>

<div class="shell">
  <AppHeader {snapshot} {connected} {locale} {t} onLocaleChange={changeLocale} />

  {#if error}
    <ErrorNotice message={error} onDismiss={() => (error = "")} />
  {/if}

  {#if loading}
    <main class="main center"><p>{t("workshopLoading")}</p></main>
  {:else if currentPath === "/workshop"}
    <WorkshopPage {locale} loggedIn={snapshot !== null} onLogin={() => requestWorkshopLogin()} onEdit={(id) => id ? openEditor(id) : createWorkshopStory()} />
  {:else if editorPath && snapshot}
    {#key editorId}<WorkshopEditor {locale} storyId={editorId} onBack={openWorkshop} onSaved={savedWorkshopStory} />{/key}
  {:else if !snapshot}
    <EntryPage bind:nickname {busy} {t} onLogin={login} />
  {:else if soloActive}
    <main class="main"><SoloGame {locale} onExit={() => (soloActive = false)} /></main>
  {:else if !room}
    <LobbyPage
      bind:code
      {snapshot}
      {busy}
      {connected}
      {t}
      modes={gameModes}
      onSelectMode={selectGameMode}
      onJoin={join}
    />
  {:else if !session}
    <RoomPage
      {snapshot}
      {room}
      {host}
      {canStart}
      {busy}
      {connected}
      {copied}
      onCopy={copyInviteLink}
      onCommand={command}
    />
  {:else}
    <GamePage {room} {session} {host} {busy} {connected} onCommand={command} />
  {/if}

  <AppFooter {snapshot} {connected} {t} />
</div>

<StoryPickerDialog
  open={picker && snapshot !== null}
  {busy}
  {connected}
  {t}
  onClose={() => (picker = false)}
  onWorkshop={openWorkshop}
  onCreate={create}
/>


<dialog bind:this={loginDialog} class="workshop-login" aria-labelledby="workshop-login-title">
  <h2 id="workshop-login-title">{locale === "en" ? "Sign in to the workshop" : "창작마당 로그인"}</h2>
  <p>{locale === "en" ? "Sign in with a guest nickname to create stories and save favorites." : "닉네임으로 게스트 로그인하면 창작과 즐겨찾기를 이용할 수 있어요."}</p>
  <form onsubmit={(event) => { event.preventDefault(); void login(); }}>
    <label for="workshop-nickname">{locale === "en" ? "Nickname" : "닉네임"}</label>
    <input id="workshop-nickname" class="input-field" bind:value={nickname} minlength="1" maxlength="20" required />
    {#if error}<p role="alert">{error}</p>{/if}
    <div class="login-actions"><button type="submit" class="primary" disabled={busy}>{locale === "en" ? "Sign in" : "로그인"}</button><button type="button" class="secondary" onclick={() => loginDialog.close()}>{locale === "en" ? "Cancel" : "취소"}</button></div>
  </form>
</dialog>
<style>.workshop-login{width:min(440px,calc(100% - 2rem));padding:2rem;background:#202820;color:#eee9dd;border:1px solid #59634f}.workshop-login::backdrop{background:#000b}.workshop-login h2{font-size:1.5rem}.workshop-login p{margin:1rem 0;line-height:1.7}.workshop-login label{display:block;margin-bottom:.5rem}.workshop-login .primary,.workshop-login .secondary{width:auto;margin-top:0}.login-actions{display:flex;gap:1rem;margin-top:1rem}</style>
