import re
import os

files = [
    r"e:\Nueva carpeta\classycine\Modelo 1 — Neón Cinemático.html",
    r"e:\Nueva carpeta\classycine\src\views\LandingView.js"
]

for file_path in files:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Fix aspect ratio
    content = content.replace("aspect-2/3", "aspect-[2/3] w-full h-full")

    # 2. Fix "Iniciar Sesión" button
    content = content.replace(
        'class="mono hidden rounded-md border border-white/15 bg-white/5 px-4 py-2 text-[13px] font-semibold uppercase tracking-wider text-white hover:border-white/35 hover:bg-white/10 sm:block"',
        'class="mono rounded-md border border-white/15 bg-white/5 px-4 py-2 text-[13px] font-semibold uppercase tracking-wider text-white hover:border-white/35 hover:bg-white/10"'
    )

    # 3. Update CSS for poster hover
    old_css = """.cc-poster .cc-poster-veil { transform: translateY(101%); transition: transform .38s cubic-bezier(.22,1,.36,1); }
.cc-poster:hover .cc-poster-veil { transform: translateY(0); }"""
    
    new_css = """.cc-poster .cc-poster-veil { opacity: 0; transition: opacity .4s ease, backdrop-filter .4s ease; backdrop-filter: blur(0px); }
.cc-poster:hover .cc-poster-veil { opacity: 1; backdrop-filter: blur(6px); pointer-events: auto; }"""
    content = content.replace(old_css, new_css)
    
    # 3b. Make poster ring smoother
    content = content.replace(
        '.cc-poster:hover .cc-poster-ring { opacity: 1; }',
        '.cc-poster .cc-poster-ring { transition: opacity .4s ease; }\n.cc-poster:hover .cc-poster-ring { opacity: 1; }'
    )

    # 4. Update HTML for poster veils
    # Replace the container
    content = re.sub(
        r'<div class="cc-poster-veil absolute inset-x-0 bottom-0 z-30 bg-\[#FF007F\] p-\d+"([^>]*)>',
        r'<div class="cc-poster-veil absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#05070A]/70 p-6 text-center pointer-events-none"\1>',
        content
    )
    
    # 5. Fix the button inside the veil to be pink since the background is now black glass
    content = re.sub(
        r'<button class="mono mt-2 w-full rounded bg-\[#05070A\] py-2 text-\[10px\] font-bold uppercase tracking-wider"([^>]*)>',
        r'<button class="mono mt-4 w-full max-w-[200px] rounded-md bg-gradient-to-r from-[#00E5FF] to-[#0088FF] py-2 text-[11px] font-bold uppercase tracking-wider text-[#05070A] shadow-lg shadow-[#00E5FF]/20 hover:scale-105 transition-transform"\1>',
        content
    )
    # The big poster has a slightly different button class
    content = re.sub(
        r'<button class="mono mt-3 w-full rounded-md bg-\[#05070A\] px-4 py-2.5 text-\[12px\] font-bold uppercase tracking-wider text-white"([^>]*)>',
        r'<button class="mono mt-5 w-full max-w-[240px] rounded-md bg-gradient-to-r from-[#00E5FF] to-[#0088FF] px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-[#05070A] shadow-lg shadow-[#00E5FF]/20 hover:scale-105 transition-transform"\1>',
        content
    )

    # Fix marquee diamonds
    content = content.replace(
        '<span class="text-white/30"',
        '<span class="text-[#00E5FF]/60"'
    )
    
    # Fix broken image backgrounds
    content = content.replace(
        'class="relative aspect-2/3',
        'class="relative aspect-[2/3] w-full h-full bg-[#0A0E16]'
    )
    content = content.replace(
        'class="relative aspect-[2/3] overflow-hidden"',
        'class="relative aspect-[2/3] w-full h-full overflow-hidden bg-[#0A0E16]"'
    )
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

print("Done")
