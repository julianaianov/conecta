import 'package:flutter_test/flutter_test.dart';
import 'package:conecta_app/app.dart';

void main() {
  testWidgets('App smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const ConectaApp());
    expect(find.byType(ConectaApp), findsOneWidget);
  });
}
