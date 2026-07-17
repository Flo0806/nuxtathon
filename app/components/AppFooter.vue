<template>
  <footer class="flex flex-col items-center gap-3 border-t border-line/40 px-5 py-8 text-center">
    <a
      href="https://github.com/flo0806/nuxtathon"
      target="_blank"
      rel="noopener noreferrer"
      class="btn"
    >
      <span class="i-simple-icons-github" aria-hidden="true" />
      Source
    </a>
    <AuthButton />
    <p class="font-mono text-[0.7rem] text-muted">
      Made with <span class="text-amber">&#9829;</span> by
      <a
        href="https://heuberger.dev"
        target="_blank"
        rel="noopener noreferrer"
        class="text-primary hover:underline"
      >
        Flo Heuberger
      </a>
    </p>
    <NuxtLink
      to="/admin"
      class="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-faint transition-colors hover:text-muted"
    >
      Admin
    </NuxtLink>
  </footer>
</template>
