"""Test the new Friction Spectrum visualization - Glass Chambers + Guided Journey"""
from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    page = browser.new_page(viewport={"width": 1400, "height": 900})

    # Navigate to the friction spectrum visualization
    page.goto('http://localhost:8080/visualizations/friction-spectrum/')

    # Wait for Three.js to load
    page.wait_for_load_state('networkidle')
    time.sleep(3)

    # Screenshot 1: Initial view with "Begin the Journey" button
    page.screenshot(path='/tmp/friction-v2-01-initial.png', full_page=True)
    print("1. Initial view with 'Begin the Journey' button captured")

    # Click the "Begin the Journey" button
    try:
        begin_btn = page.locator('.begin-btn')
        if begin_btn.is_visible():
            begin_btn.click()
            print("2. Clicked 'Begin the Journey'")

            # Wait for first zone
            time.sleep(5)
            page.screenshot(path='/tmp/friction-v2-02-seamless.png', full_page=True)
            print("3. Seamless zone captured")

            # Wait for second zone
            time.sleep(5)
            page.screenshot(path='/tmp/friction-v2-03-visible.png', full_page=True)
            print("4. Visible zone captured")

            # Wait for third zone
            time.sleep(5)
            page.screenshot(path='/tmp/friction-v2-04-gated.png', full_page=True)
            print("5. Gated zone captured")

            # Wait for fourth zone + bounce
            time.sleep(6)
            page.screenshot(path='/tmp/friction-v2-05-human-only.png', full_page=True)
            print("6. Human-Only zone (with bounce) captured")

            # Wait for journey to complete
            time.sleep(5)
            page.screenshot(path='/tmp/friction-v2-06-complete.png', full_page=True)
            print("7. Journey complete view captured")

    except Exception as e:
        print(f"Error: {e}")
        page.screenshot(path='/tmp/friction-v2-error.png', full_page=True)

    # Keep browser open briefly
    time.sleep(3)
    browser.close()

    print("\nTest complete! Screenshots saved to /tmp/friction-v2-*.png")
