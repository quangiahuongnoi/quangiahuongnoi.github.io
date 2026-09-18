package vn.quangiahuongnoi;

import javafx.application.Application;
import javafx.scene.Scene;
import javafx.scene.control.ProgressBar;
import javafx.scene.layout.BorderPane;
import javafx.scene.web.WebEngine;
import javafx.scene.web.WebView;
import javafx.stage.Stage;

/**
 * Quản gia hướng nội - Java Edition.
 *
 * This is an independent Java desktop edition. The original GitHub Pages
 * website remains untouched; this first version renders the same website
 * inside a JavaFX WebView so the visual design and JavaScript features are
 * preserved while we build native Java features separately.
 */
public class Main extends Application {

    private static final String SITE_URL = "https://quangiahuongnoi.github.io/";

    @Override
    public void start(Stage stage) {
        WebView webView = new WebView();
        WebEngine engine = webView.getEngine();
        engine.setJavaScriptEnabled(true);
        engine.setUserAgent(engine.getUserAgent() + " QuangGiaHuongNoi-JavaEdition/1.0");

        ProgressBar progress = new ProgressBar();
        progress.setMaxWidth(Double.MAX_VALUE);
        progress.progressProperty().bind(engine.getLoadWorker().progressProperty());

        engine.getLoadWorker().stateProperty().addListener((obs, oldState, newState) -> {
            switch (newState) {
                case SUCCEEDED -> progress.setVisible(false);
                case FAILED, CANCELLED -> progress.setVisible(false);
                default -> progress.setVisible(true);
            }
        });

        BorderPane root = new BorderPane(webView);
        root.setBottom(progress);

        Scene scene = new Scene(root, 1280, 820);
        stage.setTitle("Quản gia hướng nội — Java Edition");
        stage.setMinWidth(900);
        stage.setMinHeight(600);
        stage.setScene(scene);
        stage.show();

        engine.load(SITE_URL);
    }

    public static void main(String[] args) {
        launch(args);
    }
}
