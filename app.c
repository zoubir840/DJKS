#include <furi.h>
#include <furi_hal.h>
#include <gui/gui.h>

typedef enum { StateMenu, StateEmetteur, StateScanner, StateAbout } AppState;

typedef struct {
    AppState current_state;
    int menu_cursor;
} ZoubirApp;

#define MENU_ITEMS 3

static void draw_callback(Canvas* canvas, void* ctx) {
    ZoubirApp* app = (ZoubirApp*)ctx;
    canvas_clear(canvas);

    if(app->current_state == StateMenu) {
        canvas_set_font(canvas, FontPrimary);
        canvas_draw_str_aligned(canvas, 64, 10, AlignCenter, AlignTop, "ZOUBIR MASTER HUB");
        canvas_draw_line(canvas, 0, 22, 128, 22);

        canvas_set_font(canvas, FontSecondary);
        canvas_draw_str(canvas, 20, 35, "1. Emetteur RAW (A venir)");
        canvas_draw_str(canvas, 20, 48, "2. Scanner (A venir)");
        canvas_draw_str(canvas, 20, 61, "3. A propos (Infos)");

        int cursor_y = 35 + (app->menu_cursor * 13);
        canvas_draw_str(canvas, 5, cursor_y, ">");

    } else if(app->current_state == StateEmetteur) {
        canvas_set_font(canvas, FontPrimary);
        canvas_draw_str(canvas, 5, 15, "[ OUTIL EMETTEUR ]");
        canvas_set_font(canvas, FontSecondary);
        canvas_draw_str(canvas, 5, 35, "Emplacement pret pour le");
        canvas_draw_str(canvas, 5, 45, "code d'emission Sub-GHz.");
        canvas_draw_str(canvas, 5, 60, "< Retour");

    } else if(app->current_state == StateScanner) {
        canvas_set_font(canvas, FontPrimary);
        canvas_draw_str(canvas, 5, 15, "[ SCANNER FREQUENCE ]");
        canvas_set_font(canvas, FontSecondary);
        canvas_draw_str(canvas, 5, 35, "Emplacement pret pour le");
        canvas_draw_str(canvas, 5, 45, "module d'ecoute radio.");
        canvas_draw_str(canvas, 5, 60, "< Retour");

    } else if(app->current_state == StateAbout) {
        canvas_set_font(canvas, FontPrimary);
        canvas_draw_str_aligned(canvas, 64, 15, AlignCenter, AlignCenter, "DEDICACE SPECIALE");
        canvas_set_font(canvas, FontSecondary);
        canvas_draw_str_aligned(canvas, 64, 35, AlignCenter, AlignCenter, "Application creee sur");
        canvas_draw_str_aligned(canvas, 64, 45, AlignCenter, AlignCenter, "mesure pour Zoubir.");
        canvas_draw_str_aligned(canvas, 64, 55, AlignCenter, AlignCenter, "L'outil ultime.");
    }
}

static void input_callback(InputEvent* input_event, void* ctx) {
    FuriMessageQueue* event_queue = ctx;
    if(input_event->type == InputTypeShort) {
        furi_message_queue_put(event_queue, input_event, FuriWaitForever);
    }
}

int32_t zoubir_app_main(void* p) {
    UNUSED(p);
    ZoubirApp app;
    app.current_state = StateMenu;
    app.menu_cursor = 0;

    FuriMessageQueue* event_queue = furi_message_queue_alloc(8, sizeof(InputEvent));
    ViewPort* view_port = view_port_alloc();
    view_port_draw_callback_set(view_port, draw_callback, &app);
    view_port_input_callback_set(view_port, input_callback, event_queue);

    Gui* gui = furi_record_open(RECORD_GUI);
    gui_add_view_port(gui, view_port, GuiLayerFullscreen);

    InputEvent event;
    bool running = true;

    while(running) {
        if(furi_message_queue_get(event_queue, &event, 100) == FuriStatusOk) {
            if(app.current_state == StateMenu) {
                if(event.key == InputKeyBack) {
                    running = false;
                } else if(event.key == InputKeyDown) {
                    app.menu_cursor = (app.menu_cursor + 1) % MENU_ITEMS;
                } else if(event.key == InputKeyUp) {
                    app.menu_cursor = (app.menu_cursor - 1 + MENU_ITEMS) % MENU_ITEMS;
                } else if(event.key == InputKeyOk) {
                    if(app.menu_cursor == 0) app.current_state = StateEmetteur;
                    if(app.menu_cursor == 1) app.current_state = StateScanner;
                    if(app.menu_cursor == 2) app.current_state = StateAbout;
                }
            } else {
                if(event.key == InputKeyBack) {
                    app.current_state = StateMenu;
                }
            }
        }
        view_port_update(view_port);
    }

    gui_remove_view_port(gui, view_port);
    view_port_free(view_port);
    furi_message_queue_free(event_queue);
    furi_record_close(RECORD_GUI);
    return 0;
}
